-- Additive upgrade after schema.sql, trips.sql, collaboration.sql and media.sql.
-- No existing trip, review, media file or membership is removed.
begin;
alter table public.trip_photos add column if not exists stop_id text check(length(stop_id) between 1 and 128);
alter table public.trip_photos add column if not exists location_set boolean not null default false;

create table if not exists public.trip_saves (
  user_id uuid not null references public.profiles(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id,trip_id)
);
create index if not exists atlas_trip_save_trip on public.trip_saves(trip_id);
alter table public.trip_saves enable row level security;
revoke all on public.trip_saves from public,anon,authenticated;
grant select,insert,delete on public.trip_saves to authenticated;
drop policy if exists atlas_trip_save_read on public.trip_saves;
create policy atlas_trip_save_read on public.trip_saves for select to authenticated using(user_id=(select auth.uid()));
drop policy if exists atlas_trip_save_insert on public.trip_saves;
create policy atlas_trip_save_insert on public.trip_saves for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.trips t where t.id=trip_id));
drop policy if exists atlas_trip_save_delete on public.trip_saves;
create policy atlas_trip_save_delete on public.trip_saves for delete to authenticated using(user_id=(select auth.uid()));

create or replace function public.atlas_save_trip_link(p_trip uuid,p_save boolean)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  if auth.uid() is null or p_save is null then raise exception 'ATLAS_TRIP_FORBIDDEN' using errcode='42501'; end if;
  if not p_save then delete from public.trip_saves where trip_id=p_trip and user_id=auth.uid(); return false; end if;
  if not exists(select 1 from public.trips where id=p_trip) then raise exception 'ATLAS_TRIP_FORBIDDEN' using errcode='42501'; end if;
  if exists(select 1 from public.trip_saves where trip_id=p_trip and user_id=auth.uid()) then return true; end if;
  if (select count(*) from public.trip_saves where user_id=auth.uid())>=200 then raise exception 'Você pode salvar até 200 trips na sua coleção.'; end if;
  insert into public.trip_saves(user_id,trip_id) values(auth.uid(),p_trip) on conflict do nothing;
  return true;
end;
$$;

create table if not exists public.trip_join_requests (
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(trip_id,user_id)
);
create index if not exists atlas_trip_request_user on public.trip_join_requests(user_id,status);
create index if not exists atlas_trip_request_pending on public.trip_join_requests(trip_id,created_at) where status='pending';
alter table public.trip_join_requests enable row level security;
revoke all on public.trip_join_requests from public,anon,authenticated;
grant select,delete on public.trip_join_requests to authenticated;
grant insert(trip_id,user_id) on public.trip_join_requests to authenticated;
drop policy if exists atlas_trip_request_read on public.trip_join_requests;
create policy atlas_trip_request_read on public.trip_join_requests for select to authenticated using(user_id=(select auth.uid()) or exists(select 1 from public.trips t where t.id=trip_id and t.owner_id=(select auth.uid())));
drop policy if exists atlas_trip_request_insert on public.trip_join_requests;
create policy atlas_trip_request_insert on public.trip_join_requests for insert to authenticated with check(user_id=(select auth.uid()) and status='pending' and exists(select 1 from public.trips t where t.id=trip_id and t.is_public and t.owner_id<>(select auth.uid())));
drop policy if exists atlas_trip_request_delete on public.trip_join_requests;
create policy atlas_trip_request_delete on public.trip_join_requests for delete to authenticated using(user_id=(select auth.uid()) and status='pending');

create or replace function public.atlas_request_trip_join(p_trip uuid)
returns text language plpgsql security invoker set search_path='' as $$
declare result text;
begin
  if auth.uid() is null then raise exception 'ATLAS_TRIP_FORBIDDEN' using errcode='42501'; end if;
  if not exists(select 1 from public.trips t where t.id=p_trip and t.is_public and t.owner_id<>auth.uid()) then raise exception 'ATLAS_TRIP_FORBIDDEN' using errcode='42501'; end if;
  select m.status into result from public.trip_members m where m.trip_id=p_trip and m.user_id=auth.uid();
  if result is not null then return case when result='accepted' then 'member' else 'invited' end; end if;
  select r.status into result from public.trip_join_requests r where r.trip_id=p_trip and r.user_id=auth.uid();
  if result is not null then return result; end if;
  if (select count(*) from public.trip_join_requests where user_id=auth.uid() and status='pending')>=100 then raise exception 'Você já tem 100 pedidos pendentes. Aguarde uma resposta antes de pedir outra participação.'; end if;
  insert into public.trip_join_requests(trip_id,user_id) values(p_trip,auth.uid()) on conflict do nothing;
  select r.status into result from public.trip_join_requests r where r.trip_id=p_trip and r.user_id=auth.uid();
  return result;
end;
$$;
create or replace function public.atlas_cancel_trip_request(p_trip uuid)
returns void language sql security invoker set search_path='' as $$
  delete from public.trip_join_requests where trip_id=p_trip and user_id=auth.uid() and status='pending';
$$;

-- Privileged helpers live outside the Data API and check the actor themselves.
create schema if not exists atlas_internal;
revoke all on schema atlas_internal from public,anon;
grant usage on schema atlas_internal to authenticated;
create or replace function atlas_internal.list_trip_requests(p_trip uuid)
returns table(user_id uuid,username text,display_name text,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.trips where id=p_trip and owner_id=auth.uid()) then raise exception 'ATLAS_TRIP_FORBIDDEN' using errcode='42501'; end if;
  return query select r.user_id,p.username,p.display_name,r.created_at from public.trip_join_requests r join public.profiles p on p.id=r.user_id where r.trip_id=p_trip and r.status='pending' order by r.created_at,r.user_id limit 100;
end;
$$;
create or replace function public.atlas_trip_requests(p_trip uuid)
returns table(user_id uuid,username text,display_name text,created_at timestamptz)
language sql stable security invoker set search_path='' as $$ select * from atlas_internal.list_trip_requests(p_trip); $$;

create or replace function atlas_internal.respond_trip_request(p_trip uuid,p_user uuid,p_accept boolean)
returns void language plpgsql security definer set search_path='' as $$
declare previous text;
begin
  if auth.uid() is null or p_accept is null then raise exception 'ATLAS_TRIP_FORBIDDEN' using errcode='42501'; end if;
  perform 1 from public.trips where id=p_trip and owner_id=auth.uid() for update;
  if not found then raise exception 'ATLAS_TRIP_FORBIDDEN' using errcode='42501'; end if;
  select status into previous from public.trip_join_requests where trip_id=p_trip and user_id=p_user for update;
  if previous is null then raise exception 'ATLAS_TRIP_USER_NOT_FOUND' using errcode='22023'; end if;
  if previous=(case when p_accept then 'approved' else 'rejected' end) then return; end if;
  if previous<>'pending' then raise exception 'Este pedido já foi respondido.' using errcode='22023'; end if;
  if p_accept then
    insert into public.trip_members(trip_id,user_id,role,status,can_edit_itinerary,can_edit_description,can_add_photos,can_publish_profile)
      values(p_trip,p_user,'viewer','accepted',false,false,false,false)
      on conflict(trip_id,user_id) do update set status='accepted';
  end if;
  update public.trip_join_requests set status=case when p_accept then 'approved' else 'rejected' end,updated_at=now() where trip_id=p_trip and user_id=p_user;
end;
$$;
create or replace function public.atlas_respond_trip_request(p_trip uuid,p_user uuid,p_accept boolean)
returns void language sql security invoker set search_path='' as $$ select atlas_internal.respond_trip_request(p_trip,p_user,p_accept); $$;

create or replace function atlas_internal.assign_trip_photo_stops(p_trip uuid,p_links jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare trip_owner uuid; stops jsonb; link jsonb; photo uuid; target text;
begin
  if auth.uid() is null then raise exception 'ATLAS_TRIP_FORBIDDEN' using errcode='42501'; end if;
  select owner_id,t.stops into trip_owner,stops from public.trips t where id=p_trip for update;
  if trip_owner is null or not public.atlas_trip_permission(p_trip,'photos') then raise exception 'ATLAS_TRIP_FORBIDDEN' using errcode='42501'; end if;
  if p_links is null or jsonb_typeof(p_links)<>'array' or jsonb_array_length(p_links)>100 then raise exception 'ATLAS_TRIP_INVALID'; end if;
  for link in select value from jsonb_array_elements(p_links) loop
    if (jsonb_typeof(link)='object' and jsonb_typeof(link->'photo_id')='string') is not true or link ? 'stop_id' and jsonb_typeof(link->'stop_id') not in ('string','null') then raise exception 'ATLAS_TRIP_INVALID'; end if;
    photo:=(link->>'photo_id')::uuid; target:=link->>'stop_id';
    if target is not null and (length(target) not between 1 and 128 or not exists(select 1 from jsonb_array_elements(stops) s where s->>'id'=target)) then raise exception 'O destino escolhido não faz mais parte da trip.' using errcode='22023'; end if;
    update public.trip_photos set stop_id=target,location_set=true where id=photo and trip_id=p_trip and (trip_owner=auth.uid() or uploader_id=auth.uid());
    if not found then raise exception 'ATLAS_TRIP_FORBIDDEN' using errcode='42501'; end if;
  end loop;
end;
$$;
create or replace function public.atlas_assign_trip_photo_stops(p_trip uuid,p_links jsonb)
returns void language sql security invoker set search_path='' as $$ select atlas_internal.assign_trip_photo_stops(p_trip,p_links); $$;

revoke all on function atlas_internal.list_trip_requests(uuid),atlas_internal.respond_trip_request(uuid,uuid,boolean),atlas_internal.assign_trip_photo_stops(uuid,jsonb) from public,anon,authenticated;
grant execute on function atlas_internal.list_trip_requests(uuid),atlas_internal.respond_trip_request(uuid,uuid,boolean),atlas_internal.assign_trip_photo_stops(uuid,jsonb) to authenticated;
revoke all on function public.atlas_save_trip_link(uuid,boolean),public.atlas_request_trip_join(uuid),public.atlas_cancel_trip_request(uuid),public.atlas_trip_requests(uuid),public.atlas_respond_trip_request(uuid,uuid,boolean),public.atlas_assign_trip_photo_stops(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.atlas_save_trip_link(uuid,boolean),public.atlas_request_trip_join(uuid),public.atlas_cancel_trip_request(uuid),public.atlas_trip_requests(uuid),public.atlas_respond_trip_request(uuid,uuid,boolean),public.atlas_assign_trip_photo_stops(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;

-- Atualização aditiva do Atlas: execute depois de schema.sql. Não apaga postagens.
begin;
create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  notes text not null default '' check (length(notes) <= 5000),
  cover_path text,
  is_public boolean not null default false,
  stops jsonb not null default '[]'::jsonb check (jsonb_typeof(stops) = 'array' and jsonb_array_length(stops) <= 200),
  revision uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.trip_members (
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('viewer','editor')),
  status text not null default 'invited' check (status in ('invited','accepted')),
  primary key (trip_id,user_id)
);
create index if not exists atlas_trip_owner on public.trips(owner_id);
create index if not exists atlas_trip_member_user on public.trip_members(user_id);
-- Helpers use definer access to avoid recursive membership policies.
create or replace function public.atlas_trip_role(p_trip uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case when t.owner_id = auth.uid() then 'owner' else
    (select case when m.status = 'invited' then 'invited' else m.role end
     from public.trip_members m where m.trip_id = t.id and m.user_id = auth.uid()) end
  from public.trips t where t.id = p_trip;
$$;
create or replace function public.atlas_can_read_trip(p_trip uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select t.is_public or public.atlas_trip_role(t.id) is not null from public.trips t where t.id = p_trip),false);
$$;
revoke all on function public.atlas_trip_role(uuid), public.atlas_can_read_trip(uuid) from public;
grant execute on function public.atlas_trip_role(uuid), public.atlas_can_read_trip(uuid) to anon, authenticated;
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
revoke all on public.trips, public.trip_members from anon, authenticated;
grant select on public.trips to anon, authenticated;
grant select on public.trip_members to authenticated;
drop policy if exists atlas_trip_read on public.trips;
create policy atlas_trip_read on public.trips for select to anon, authenticated using (public.atlas_can_read_trip(id));
drop policy if exists atlas_trip_member_read on public.trip_members;
create policy atlas_trip_member_read on public.trip_members for select to authenticated
  using (user_id = auth.uid() or public.atlas_trip_role(trip_id) in ('owner','viewer','editor'));

-- Browser writes go only through checked RPCs; public links never grant editing.
create or replace function public.atlas_save_trip(p_id uuid, p_expected_revision uuid, p_name text, p_notes text, p_cover_path text, p_public boolean, p_stops jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare previous public.trips; result public.trips; access text; stop jsonb;
begin
  if auth.uid() is null then raise exception 'ATLAS_TRIP_FORBIDDEN' using errcode = '42501'; end if;
  if p_stops is null or jsonb_typeof(p_stops) <> 'array' or jsonb_array_length(p_stops) > 200 then raise exception 'ATLAS_TRIP_INVALID'; end if;
  for stop in select value from jsonb_array_elements(p_stops) loop
    if (jsonb_typeof(stop) = 'object' and jsonb_typeof(stop->'name') = 'string'
      and length(trim(stop->>'name')) between 1 and 120
      and jsonb_typeof(stop->'lat') = 'number' and jsonb_typeof(stop->'lng') = 'number'
      and (stop->>'lat')::numeric between -90 and 90 and (stop->>'lng')::numeric between -180 and 180
      and jsonb_typeof(stop->'notes') = 'string' and length(stop->>'notes') <= 2000
      and jsonb_typeof(stop->'date') = 'string') is not true then raise exception 'ATLAS_TRIP_INVALID'; end if;
    if stop->>'date' <> '' then
      if stop->>'date' !~ '^\d{4}-\d{2}-\d{2}$' or to_char((stop->>'date')::date,'YYYY-MM-DD') <> stop->>'date' then raise exception 'ATLAS_TRIP_INVALID'; end if;
    end if;
  end loop;
  perform pg_advisory_xact_lock(hashtextextended(p_id::text, 42));
  select * into previous from public.trips where id = p_id for update;
  if found then
    access := public.atlas_trip_role(p_id);
    if access is null or access not in ('owner','editor') then raise exception 'ATLAS_TRIP_FORBIDDEN' using errcode = '42501'; end if;
    if p_expected_revision is distinct from previous.revision then raise exception 'ATLAS_TRIP_CONFLICT' using errcode = '40001'; end if;
    if access <> 'owner' and p_public is distinct from previous.is_public then raise exception 'ATLAS_TRIP_FORBIDDEN' using errcode = '42501'; end if;
  elsif p_expected_revision is not null then raise exception 'ATLAS_TRIP_CONFLICT' using errcode = '40001';
  end if;
  if p_cover_path is not null and p_cover_path is distinct from previous.cover_path then
    if split_part(p_cover_path,'/',1) <> auth.uid()::text or not exists
      (select 1 from storage.objects where bucket_id = 'atlas-trip-covers' and name = p_cover_path)
    then raise exception 'ATLAS_TRIP_INVALID_COVER' using errcode = '42501'; end if;
  end if;
  if previous.id is null then
    insert into public.trips(id,owner_id,name,notes,cover_path,is_public,stops)
    values(p_id,auth.uid(),trim(p_name),p_notes,p_cover_path,p_public,p_stops) returning * into result;
  else
    update public.trips set name=trim(p_name),notes=p_notes,cover_path=p_cover_path,is_public=p_public,stops=p_stops,
      revision=gen_random_uuid(),updated_at=now() where id=p_id returning * into result;
  end if;
  return to_jsonb(result);
end;
$$;
create or replace function public.atlas_invite_trip(p_trip uuid, p_username text, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare target uuid;
begin
  perform 1 from public.trips where id=p_trip and owner_id=auth.uid() for update;
  if not found then raise exception 'ATLAS_TRIP_FORBIDDEN' using errcode = '42501'; end if;
  if p_role not in ('editor','viewer') or p_role is null then raise exception 'ATLAS_TRIP_INVALID'; end if;
  select id into target from public.profiles where username=p_username and is_public;
  if target is null or target=auth.uid() then raise exception 'ATLAS_TRIP_USER_NOT_FOUND' using errcode='22023'; end if;
  insert into public.trip_members(trip_id,user_id,role) values(p_trip,target,p_role)
  on conflict(trip_id,user_id) do update set role=excluded.role;
end;
$$;
create or replace function public.atlas_respond_trip_invite(p_trip uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'ATLAS_TRIP_FORBIDDEN' using errcode='42501'; end if;
  if p_accept then update public.trip_members set status='accepted' where trip_id=p_trip and user_id=auth.uid();
  else delete from public.trip_members where trip_id=p_trip and user_id=auth.uid(); end if;
  if not found then raise exception 'ATLAS_TRIP_FORBIDDEN' using errcode='42501'; end if;
end;
$$;
create or replace function public.atlas_remove_trip_member(p_trip uuid, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.trips where id=p_trip and owner_id=auth.uid() for update;
  if not found then raise exception 'ATLAS_TRIP_FORBIDDEN' using errcode='42501'; end if;
  delete from public.trip_members where trip_id=p_trip and user_id=p_user;
end;
$$;
create or replace function public.atlas_trip_people(p_trip uuid)
returns table(user_id uuid, username text, role text, status text)
language plpgsql security definer set search_path = '' as $$
begin
  if public.atlas_trip_role(p_trip) is null or public.atlas_trip_role(p_trip) not in ('owner','viewer','editor') then raise exception 'ATLAS_TRIP_FORBIDDEN' using errcode='42501'; end if;
  return query select m.user_id,p.username,m.role,m.status from public.trip_members m join public.profiles p on p.id=m.user_id where m.trip_id=p_trip order by p.username;
end;
$$;
create or replace function public.atlas_delete_trip(p_trip uuid, p_expected_revision uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare previous public.trips;
begin
  select * into previous from public.trips where id=p_trip for update;
  if previous.id is null or previous.owner_id is distinct from auth.uid() then raise exception 'ATLAS_TRIP_FORBIDDEN' using errcode='42501'; end if;
  if previous.revision is distinct from p_expected_revision then raise exception 'ATLAS_TRIP_CONFLICT' using errcode='40001'; end if;
  delete from public.trips where id=p_trip;
end;
$$;
revoke all on function public.atlas_save_trip(uuid,uuid,text,text,text,boolean,jsonb), public.atlas_invite_trip(uuid,text,text), public.atlas_respond_trip_invite(uuid,boolean), public.atlas_remove_trip_member(uuid,uuid), public.atlas_trip_people(uuid), public.atlas_delete_trip(uuid,uuid) from public,anon,authenticated;
grant execute on function public.atlas_save_trip(uuid,uuid,text,text,text,boolean,jsonb), public.atlas_invite_trip(uuid,text,text), public.atlas_respond_trip_invite(uuid,boolean), public.atlas_remove_trip_member(uuid,uuid), public.atlas_trip_people(uuid), public.atlas_delete_trip(uuid,uuid) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('atlas-trip-covers','atlas-trip-covers',false,1048576,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
drop policy if exists atlas_trip_cover_read on storage.objects;
create policy atlas_trip_cover_read on storage.objects for select to anon,authenticated using
  (bucket_id='atlas-trip-covers' and (split_part(name,'/',1)=auth.uid()::text or exists (select 1 from public.trips t where t.cover_path=storage.objects.name and public.atlas_can_read_trip(t.id))));
drop policy if exists atlas_trip_cover_insert on storage.objects;
create policy atlas_trip_cover_insert on storage.objects for insert to authenticated with check
  (bucket_id='atlas-trip-covers' and split_part(name,'/',1)=auth.uid()::text);
drop policy if exists atlas_trip_cover_delete on storage.objects;
create policy atlas_trip_cover_delete on storage.objects for delete to authenticated using
  (bucket_id='atlas-trip-covers' and split_part(name,'/',1)=auth.uid()::text);
notify pgrst, 'reload schema';
commit;

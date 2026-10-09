-- Execute depois de schema.sql e trips.sql. Atualização aditiva e repetível.
begin;
alter table public.trip_members add column if not exists can_edit_itinerary boolean;
alter table public.trip_members add column if not exists can_edit_description boolean;
alter table public.trip_members add column if not exists can_add_photos boolean;
alter table public.trip_members add column if not exists can_publish_profile boolean;
update public.trip_members set
  can_edit_itinerary=coalesce(can_edit_itinerary,role='editor'),
  can_edit_description=coalesce(can_edit_description,role='editor'),
  can_add_photos=coalesce(can_add_photos,false),
  can_publish_profile=coalesce(can_publish_profile,false);
alter table public.trip_members
  alter column can_edit_itinerary set default false, alter column can_edit_itinerary set not null,
  alter column can_edit_description set default false, alter column can_edit_description set not null,
  alter column can_add_photos set default false, alter column can_add_photos set not null,
  alter column can_publish_profile set default false, alter column can_publish_profile set not null;

create or replace function public.atlas_trip_permission(p_trip uuid,p_action text)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce((select t.owner_id=auth.uid() or exists(
    select 1 from public.trip_members m where m.trip_id=t.id and m.user_id=auth.uid() and m.status='accepted'
      and case p_action when 'itinerary' then m.can_edit_itinerary when 'description' then m.can_edit_description
        when 'photos' then m.can_add_photos when 'publish' then m.can_publish_profile else false end)
    from public.trips t where t.id=p_trip),false);
$$;
revoke all on function public.atlas_trip_permission(uuid,text) from public,anon,authenticated;
grant execute on function public.atlas_trip_permission(uuid,text) to authenticated;

create or replace function public.atlas_invite_trip_permissions(p_trip uuid,p_username text,p_itinerary boolean,p_description boolean,p_photos boolean,p_publish boolean)
returns void language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
  perform 1 from public.trips where id=p_trip and owner_id=auth.uid() for update;
  if not found then raise exception 'ATLAS_TRIP_FORBIDDEN' using errcode='42501'; end if;
  if p_itinerary is null or p_description is null or p_photos is null or p_publish is null then raise exception 'ATLAS_TRIP_INVALID'; end if;
  select id into target from public.profiles where username=p_username and is_public;
  if target is null or target=auth.uid() then raise exception 'ATLAS_TRIP_USER_NOT_FOUND' using errcode='22023'; end if;
  insert into public.trip_members(trip_id,user_id,role,can_edit_itinerary,can_edit_description,can_add_photos,can_publish_profile)
  values(p_trip,target,case when p_itinerary or p_description then 'editor' else 'viewer' end,p_itinerary,p_description,p_photos,p_publish)
  on conflict(trip_id,user_id) do update set role=excluded.role,can_edit_itinerary=excluded.can_edit_itinerary,
    can_edit_description=excluded.can_edit_description,can_add_photos=excluded.can_add_photos,can_publish_profile=excluded.can_publish_profile;
end;
$$;
-- Compatibility with the earlier invitation API, including verification scripts.
create or replace function public.atlas_invite_trip(p_trip uuid,p_username text,p_role text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_role is null or p_role not in ('viewer','editor') then raise exception 'ATLAS_TRIP_INVALID'; end if;
  perform public.atlas_invite_trip_permissions(p_trip,p_username,p_role='editor',p_role='editor',false,false);
end;
$$;
create or replace function public.atlas_set_trip_permissions(p_trip uuid,p_user uuid,p_itinerary boolean,p_description boolean,p_photos boolean,p_publish boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.trips where id=p_trip and owner_id=auth.uid() for update;
  if not found then raise exception 'ATLAS_TRIP_FORBIDDEN' using errcode='42501'; end if;
  if p_itinerary is null or p_description is null or p_photos is null or p_publish is null then raise exception 'ATLAS_TRIP_INVALID'; end if;
  update public.trip_members set role=case when p_itinerary or p_description then 'editor' else 'viewer' end,
    can_edit_itinerary=p_itinerary,can_edit_description=p_description,can_add_photos=p_photos,can_publish_profile=p_publish
    where trip_id=p_trip and user_id=p_user;
  if not found then raise exception 'ATLAS_TRIP_USER_NOT_FOUND' using errcode='22023'; end if;
end;
$$;
-- A new RPC avoids changing the return type of the original atlas_trip_people.
create or replace function public.atlas_trip_collaborators(p_trip uuid)
returns table(user_id uuid,username text,role text,status text,can_edit_itinerary boolean,can_edit_description boolean,can_add_photos boolean,can_publish_profile boolean)
language plpgsql security definer set search_path='' as $$
begin
  if public.atlas_trip_role(p_trip) is null or public.atlas_trip_role(p_trip) not in ('owner','viewer','editor') then raise exception 'ATLAS_TRIP_FORBIDDEN' using errcode='42501'; end if;
  return query select m.user_id,p.username,m.role,m.status,m.can_edit_itinerary,m.can_edit_description,m.can_add_photos,m.can_publish_profile
    from public.trip_members m join public.profiles p on p.id=m.user_id where m.trip_id=p_trip order by p.username;
end;
$$;

create table if not exists public.trip_photos (
  id uuid primary key,
  trip_id uuid not null references public.trips(id) on delete cascade,
  uploader_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique,
  caption text not null default '' check(length(caption)<=500),
  created_at timestamptz not null default now()
);
create index if not exists atlas_trip_photo_trip on public.trip_photos(trip_id);
alter table public.trip_photos enable row level security;
revoke all on public.trip_photos from anon,authenticated;
grant select on public.trip_photos to anon,authenticated;
drop policy if exists atlas_trip_photo_read on public.trip_photos;
create policy atlas_trip_photo_read on public.trip_photos for select to anon,authenticated using(public.atlas_can_read_trip(trip_id));

create or replace function public.atlas_add_trip_photo(p_trip uuid,p_id uuid,p_path text,p_caption text)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.trips where id=p_trip for update;
  if not public.atlas_trip_permission(p_trip,'photos') then raise exception 'ATLAS_TRIP_FORBIDDEN' using errcode='42501'; end if;
  if p_path is distinct from auth.uid()::text||'/'||p_trip::text||'/'||p_id::text||'.jpg' or p_caption is null or length(p_caption)>500
    or not exists(select 1 from storage.objects where bucket_id='atlas-trip-media' and name=p_path)
    then raise exception 'ATLAS_TRIP_INVALID_PHOTO' using errcode='42501'; end if;
  -- Idempotent retry after a response was lost; never overwrite another photo.
  if exists(select 1 from public.trip_photos where id=p_id and trip_id=p_trip and uploader_id=auth.uid() and storage_path=p_path) then return; end if;
  if (select count(*) from public.trip_photos where trip_id=p_trip)>=100 then raise exception 'ATLAS_TRIP_PHOTO_LIMIT'; end if;
  insert into public.trip_photos(id,trip_id,uploader_id,storage_path,caption) values(p_id,p_trip,auth.uid(),p_path,p_caption);
end;
$$;
create or replace function public.atlas_remove_trip_photo(p_photo uuid)
returns void language plpgsql security definer set search_path='' as $$
declare photo public.trip_photos;
begin
  select * into photo from public.trip_photos where id=p_photo for update;
  if photo.id is null or (public.atlas_trip_role(photo.trip_id) is distinct from 'owner'
    and not(photo.uploader_id=auth.uid() and public.atlas_trip_permission(photo.trip_id,'photos')))
    then raise exception 'ATLAS_TRIP_FORBIDDEN' using errcode='42501'; end if;
  delete from public.trip_photos where id=p_photo;
end;
$$;

create table if not exists public.trip_publications (
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(trip_id,user_id)
);
create index if not exists atlas_trip_publication_user on public.trip_publications(user_id);
create or replace function public.atlas_trip_publication_visible(p_trip uuid,p_user uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce((select t.is_public and p.is_public and (t.owner_id=p_user or exists(
    select 1 from public.trip_members m where m.trip_id=t.id and m.user_id=p_user and m.status='accepted' and m.can_publish_profile))
    from public.trips t join public.profiles p on p.id=p_user where t.id=p_trip),false);
$$;
revoke all on function public.atlas_trip_publication_visible(uuid,uuid) from public,anon,authenticated;
grant execute on function public.atlas_trip_publication_visible(uuid,uuid) to anon,authenticated;
alter table public.trip_publications enable row level security;
revoke all on public.trip_publications from anon,authenticated;
grant select on public.trip_publications to anon,authenticated;
drop policy if exists atlas_trip_publication_read on public.trip_publications;
create policy atlas_trip_publication_read on public.trip_publications for select to anon,authenticated
  using(user_id=auth.uid() or public.atlas_trip_publication_visible(trip_id,user_id));
create or replace function public.atlas_publish_trip_profile(p_trip uuid,p_publish boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'ATLAS_TRIP_FORBIDDEN' using errcode='42501'; end if;
  if p_publish is not true then delete from public.trip_publications where trip_id=p_trip and user_id=auth.uid(); return; end if;
  perform 1 from public.trips where id=p_trip for update;
  if not public.atlas_trip_permission(p_trip,'publish') then raise exception 'ATLAS_TRIP_FORBIDDEN' using errcode='42501'; end if;
  if not public.atlas_trip_publication_visible(p_trip,auth.uid()) then raise exception 'ATLAS_TRIP_PUBLISH_PUBLIC'; end if;
  insert into public.trip_publications(trip_id,user_id) values(p_trip,auth.uid()) on conflict do nothing;
end;
$$;
-- Revoked permission / leaving / privatizing cannot silently republish later.
create or replace function public.atlas_clear_trip_publications()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if TG_TABLE_NAME='trips' then
    if old.is_public and not new.is_public then delete from public.trip_publications where trip_id=old.id; end if;
  elsif TG_OP='DELETE' then delete from public.trip_publications where trip_id=old.trip_id and user_id=old.user_id;
  elsif old.can_publish_profile and not new.can_publish_profile then delete from public.trip_publications where trip_id=old.trip_id and user_id=old.user_id;
  end if;
  return null;
end;
$$;
revoke all on function public.atlas_clear_trip_publications() from public,anon,authenticated;
drop trigger if exists atlas_member_publications on public.trip_members;
create trigger atlas_member_publications after update or delete on public.trip_members for each row execute function public.atlas_clear_trip_publications();
drop trigger if exists atlas_private_publications on public.trips;
create trigger atlas_private_publications after update on public.trips for each row execute function public.atlas_clear_trip_publications();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('atlas-trip-media','atlas-trip-media',false,10485760,array['image/jpeg']) on conflict(id) do update
  set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
update storage.buckets set public=false where id='atlas-trip-covers';
create or replace function public.atlas_can_upload_trip_photo(p_path text)
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
  if split_part(p_path,'/',1) is distinct from auth.uid()::text or split_part(p_path,'/',2) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then return false; end if;
  return public.atlas_trip_permission(split_part(p_path,'/',2)::uuid,'photos');
end;
$$;
revoke all on function public.atlas_can_upload_trip_photo(text) from public,anon,authenticated;
grant execute on function public.atlas_can_upload_trip_photo(text) to authenticated;
drop policy if exists atlas_trip_media_read on storage.objects;
create policy atlas_trip_media_read on storage.objects for select to anon,authenticated using(bucket_id='atlas-trip-media' and (
  split_part(name,'/',1)=auth.uid()::text or exists(select 1 from public.trip_photos p where p.storage_path=storage.objects.name and public.atlas_can_read_trip(p.trip_id))));
drop policy if exists atlas_trip_media_insert on storage.objects;
create policy atlas_trip_media_insert on storage.objects for insert to authenticated with check(bucket_id='atlas-trip-media' and public.atlas_can_upload_trip_photo(name));
drop policy if exists atlas_trip_media_delete on storage.objects;
create policy atlas_trip_media_delete on storage.objects for delete to authenticated using(bucket_id='atlas-trip-media' and split_part(name,'/',1)=auth.uid()::text
  and not exists(select 1 from public.trip_photos p where p.storage_path=storage.objects.name));

revoke all on function public.atlas_invite_trip_permissions(uuid,text,boolean,boolean,boolean,boolean), public.atlas_set_trip_permissions(uuid,uuid,boolean,boolean,boolean,boolean),
  public.atlas_trip_collaborators(uuid),public.atlas_add_trip_photo(uuid,uuid,text,text),public.atlas_remove_trip_photo(uuid),public.atlas_publish_trip_profile(uuid,boolean) from public,anon,authenticated;
grant execute on function public.atlas_invite_trip_permissions(uuid,text,boolean,boolean,boolean,boolean), public.atlas_set_trip_permissions(uuid,uuid,boolean,boolean,boolean,boolean),
  public.atlas_trip_collaborators(uuid),public.atlas_add_trip_photo(uuid,uuid,text,text),public.atlas_remove_trip_photo(uuid),public.atlas_publish_trip_profile(uuid,boolean) to authenticated;

-- atlas_save_trip with individual checks is defined below.
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
    if access is null or access not in ('owner','editor','viewer') then raise exception 'ATLAS_TRIP_FORBIDDEN' using errcode = '42501'; end if;
    if p_expected_revision is distinct from previous.revision then raise exception 'ATLAS_TRIP_CONFLICT' using errcode = '40001'; end if;

    if access <> 'owner' then
      if not public.atlas_trip_permission(p_id,'itinerary') and not public.atlas_trip_permission(p_id,'description') then raise exception 'ATLAS_TRIP_FORBIDDEN' using errcode='42501'; end if;
      if p_public is distinct from previous.is_public then raise exception 'ATLAS_TRIP_FORBIDDEN' using errcode='42501'; end if;
      if not public.atlas_trip_permission(p_id,'itinerary') and (trim(p_name) is distinct from previous.name or p_cover_path is distinct from previous.cover_path
        or (select coalesce(jsonb_agg(value-'notes' order by ord),'[]'::jsonb) from jsonb_array_elements(p_stops) with ordinality as s(value,ord))
          is distinct from (select coalesce(jsonb_agg(value-'notes' order by ord),'[]'::jsonb) from jsonb_array_elements(previous.stops) with ordinality as s(value,ord)))
        then raise exception 'ATLAS_TRIP_FORBIDDEN' using errcode='42501'; end if;
      if not public.atlas_trip_permission(p_id,'description') and (p_notes is distinct from previous.notes or exists(
        select 1 from jsonb_array_elements(p_stops) with ordinality as s(value,ord)
        join jsonb_array_elements(previous.stops) with ordinality as old(value,ord) on old.value->>'id'=s.value->>'id'
          or (old.value->>'id' is null and s.value->>'id' is null and old.ord=s.ord)
        where s.value->'notes' is distinct from old.value->'notes') or exists(
        select 1 from jsonb_array_elements(p_stops) s where coalesce(s->>'notes','')<>'' and not exists(
          select 1 from jsonb_array_elements(previous.stops) old where old->>'id'=s->>'id' or old=s)))
        then raise exception 'ATLAS_TRIP_FORBIDDEN' using errcode='42501'; end if;
    end if;
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

notify pgrst, 'reload schema';
commit;

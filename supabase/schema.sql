-- Run once in the SQL Editor of YOUR Supabase project (as the project owner).
-- Repeatable installation. No credentials or public buckets are created here.
begin;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,30}$'),
  display_name text not null check (char_length(display_name) between 1 and 80),
  bio text not null default '' check (char_length(bio) <= 500),
  avatar_path text,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (avatar_path is null or avatar_path like id::text || '/%')
);
create table if not exists public.destinations (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 128),
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  data jsonb not null,
  revision uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, id),
  check ((jsonb_typeof(data) = 'object' and jsonb_typeof(data->'name') = 'string'
    and char_length(data->>'name') between 1 and 120
    and jsonb_typeof(data->'lat') = 'number' and (data->>'lat')::numeric between -90 and 90
    and jsonb_typeof(data->'lng') = 'number' and (data->>'lng')::numeric between -180 and 180
    and jsonb_typeof(data->'visits') = 'array' and jsonb_array_length(data->'visits') <= 1000
    and jsonb_typeof(data->'tags') = 'array' and jsonb_array_length(data->'tags') <= 30
    and jsonb_typeof(data->'photoIds') = 'array' and jsonb_array_length(data->'photoIds') <= 100
    and jsonb_typeof(data->'notes') = 'string' and char_length(data->>'notes') <= 20000
    and jsonb_typeof(data->'rating') = 'number' and (data->>'rating')::numeric between 0 and 5) is true)
);
create table if not exists public.photos (
  owner_id uuid not null,
  destination_id text not null,
  id text not null check (char_length(id) between 1 and 128),
  storage_path text not null,
  thumbnail_path text not null,
  caption text not null default '' check (char_length(caption) <= 1000),
  primary key (owner_id, destination_id, id),
  unique (owner_id, id),
  foreign key (owner_id, destination_id) references public.destinations(owner_id, id) on delete cascade,
  check (storage_path like owner_id::text || '/%' and thumbnail_path like owner_id::text || '/%')
);
create index if not exists destinations_public_owner on public.destinations(owner_id, visibility);
create index if not exists photos_paths on public.photos(storage_path);
create index if not exists photos_thumbnails on public.photos(thumbnail_path);

create or replace function public.atlas_touch_profile()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists atlas_profile_updated on public.profiles;
create trigger atlas_profile_updated before update on public.profiles
  for each row execute function public.atlas_touch_profile();
revoke all on function public.atlas_touch_profile() from public, anon, authenticated;

create or replace function public.atlas_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, username, display_name)
  values (new.id, 'viajante_' || left(replace(new.id::text, '-', ''), 20),
    left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), 'Viajante'), 80));
  return new;
end;
$$;
revoke all on function public.atlas_new_user() from public, anon, authenticated;
drop trigger if exists atlas_create_profile on auth.users;
create trigger atlas_create_profile after insert on auth.users
  for each row execute function public.atlas_new_user();
-- Existing accounts can also use the application after installation.
insert into public.profiles(id, username, display_name)
select id, 'viajante_' || left(replace(id::text, '-', ''), 20),
  left(coalesce(nullif(trim(raw_user_meta_data->>'display_name'), ''), 'Viajante'), 80)
from auth.users on conflict (id) do nothing;

alter table public.profiles enable row level security;
alter table public.destinations enable row level security;
alter table public.photos enable row level security;
grant usage on schema public to anon, authenticated;
revoke all on public.profiles, public.destinations, public.photos from anon, authenticated;
grant select on public.profiles, public.destinations, public.photos to anon;
grant select, insert, update, delete on public.profiles, public.destinations, public.photos to authenticated;
-- Profiles are created by the auth trigger, not by arbitrary browser inserts.
revoke insert, delete on public.profiles from authenticated;

drop policy if exists atlas_profile_read on public.profiles;
create policy atlas_profile_read on public.profiles for select to anon, authenticated
  using (is_public or id = (select auth.uid()));
drop policy if exists atlas_profile_update on public.profiles;
create policy atlas_profile_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
drop policy if exists atlas_destination_read on public.destinations;
create policy atlas_destination_read on public.destinations for select to anon, authenticated
  using (owner_id = (select auth.uid()) or (visibility = 'public' and exists
    (select 1 from public.profiles p where p.id = owner_id and p.is_public)));
drop policy if exists atlas_destination_insert on public.destinations;
create policy atlas_destination_insert on public.destinations for insert to authenticated
  with check (owner_id = (select auth.uid()));
drop policy if exists atlas_destination_update on public.destinations;
create policy atlas_destination_update on public.destinations for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists atlas_destination_delete on public.destinations;
create policy atlas_destination_delete on public.destinations for delete to authenticated
  using (owner_id = (select auth.uid()));
drop policy if exists atlas_photo_read on public.photos;
create policy atlas_photo_read on public.photos for select to anon, authenticated
  using (exists (select 1 from public.destinations d where d.owner_id = photos.owner_id and d.id = destination_id));
drop policy if exists atlas_photo_write on public.photos;
create policy atlas_photo_write on public.photos for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('atlas-media', 'atlas-media', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
       ('atlas-avatars', 'atlas-avatars', false, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists atlas_storage_read on storage.objects;
create policy atlas_storage_read on storage.objects for select to anon, authenticated
  using (
    (bucket_id in ('atlas-media', 'atlas-avatars') and (storage.foldername(name))[1] = (select auth.uid())::text)
    or (bucket_id = 'atlas-media' and exists (select 1 from public.photos p
      where p.storage_path = name or p.thumbnail_path = name))
    or (bucket_id = 'atlas-avatars' and exists (select 1 from public.profiles p where p.avatar_path = name and p.is_public))
  );
drop policy if exists atlas_storage_insert on storage.objects;
create policy atlas_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('atlas-media', 'atlas-avatars') and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists atlas_storage_update on storage.objects;
create policy atlas_storage_update on storage.objects for update to authenticated
  using (bucket_id in ('atlas-media', 'atlas-avatars') and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id in ('atlas-media', 'atlas-avatars') and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists atlas_storage_delete on storage.objects;
create policy atlas_storage_delete on storage.objects for delete to authenticated
  using (bucket_id in ('atlas-media', 'atlas-avatars') and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Security INVOKER: RLS also applies inside these transactions.
create or replace function public.save_destination(
  p_id text, p_data jsonb, p_visibility text, p_expected_revision uuid, p_photos jsonb
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  owner uuid := auth.uid(); previous uuid; next_revision uuid := gen_random_uuid(); photo jsonb;
begin
  if owner is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  -- Serializes simultaneous first writes too; the existing-row lock alone cannot.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner::text || ':' || p_id, 0));
  select revision into previous from public.destinations where owner_id = owner and id = p_id for update;
  if previous is distinct from p_expected_revision then
    raise exception 'ATLAS_CONFLICT' using errcode = '40001';
  end if;
  if p_photos is null or jsonb_typeof(p_photos) <> 'array' or jsonb_array_length(p_photos) > 100 then
    raise exception 'Invalid photos' using errcode = '22023';
  end if;
  insert into public.destinations(owner_id, id, data, visibility, revision)
  values (owner, p_id, p_data, p_visibility, next_revision)
  on conflict (owner_id, id) do update set data = excluded.data, visibility = excluded.visibility,
    revision = excluded.revision, updated_at = now();
  delete from public.photos where owner_id = owner and destination_id = p_id;
  for photo in select value from jsonb_array_elements(p_photos) loop
    if not exists (select 1 from storage.objects where bucket_id = 'atlas-media' and name = photo->>'storage_path')
      or not exists (select 1 from storage.objects where bucket_id = 'atlas-media' and name = photo->>'thumbnail_path') then
      raise exception 'Missing photo object' using errcode = '22023';
    end if;
    insert into public.photos(owner_id, destination_id, id, storage_path, thumbnail_path, caption)
    values (owner, p_id, photo->>'id', photo->>'storage_path', photo->>'thumbnail_path', coalesce(photo->>'caption', ''));
  end loop;
  return next_revision;
end;
$$;
create or replace function public.delete_destination(p_id text, p_expected_revision uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare owner uuid := auth.uid(); previous uuid;
begin
  if owner is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner::text || ':' || p_id, 0));
  select revision into previous from public.destinations where owner_id = owner and id = p_id for update;
  if previous is null then return; end if;
  if previous is distinct from p_expected_revision then raise exception 'ATLAS_CONFLICT' using errcode = '40001'; end if;
  delete from public.destinations where owner_id = owner and id = p_id;
end;
$$;
revoke all on function public.save_destination(text,jsonb,text,uuid,jsonb) from public, anon;
revoke all on function public.delete_destination(text,uuid) from public, anon;
grant execute on function public.save_destination(text,jsonb,text,uuid,jsonb) to authenticated;
grant execute on function public.delete_destination(text,uuid) to authenticated;
commit;

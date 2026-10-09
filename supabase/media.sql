-- Apply AFTER schema.sql, trips.sql and collaboration.sql. Safe to repeat.
-- Preserves photos and keeps both media buckets private.
begin;
alter table public.photos add column if not exists kind text not null default 'image';
alter table public.photos add column if not exists motion_path text;
alter table public.photos add column if not exists duration double precision;
alter table public.photos drop constraint if exists atlas_photo_media;
alter table public.photos add constraint atlas_photo_media check (
  kind in ('image','video','live') and ((kind='live') = (motion_path is not null))
  and (motion_path is null or motion_path like owner_id::text||'/%')
  and ((kind='image' and duration is null) or (kind<>'image' and duration>0 and duration<1000000000 and duration is not null))
);
create index if not exists atlas_photo_motion on public.photos(motion_path) where motion_path is not null;
alter table public.trip_photos add column if not exists kind text not null default 'image';
alter table public.trip_photos add column if not exists thumbnail_path text;
alter table public.trip_photos add column if not exists motion_path text;
alter table public.trip_photos add column if not exists duration double precision;
alter table public.trip_photos drop constraint if exists atlas_trip_photo_media;
alter table public.trip_photos add constraint atlas_trip_photo_media check (
  kind in ('image','video','live') and ((kind='live') = (motion_path is not null))
  and (storage_path like uploader_id::text||'/'||trip_id::text||'/%')
  and (thumbnail_path is null or thumbnail_path like uploader_id::text||'/'||trip_id::text||'/%')
  and (motion_path is null or motion_path like uploader_id::text||'/'||trip_id::text||'/%')
  and ((kind='image' and duration is null) or (kind<>'image' and thumbnail_path is not null and duration>0 and duration<1000000000 and duration is not null))
);
create index if not exists atlas_trip_photo_thumbnail on public.trip_photos(thumbnail_path) where thumbnail_path is not null;
create index if not exists atlas_trip_photo_motion on public.trip_photos(motion_path) where motion_path is not null;
update storage.buckets set public=false,file_size_limit=52428800,
  allowed_mime_types=array['image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime']
  where id in ('atlas-media','atlas-trip-media');
drop policy if exists atlas_storage_read on storage.objects;
create policy atlas_storage_read on storage.objects for select to anon,authenticated using (
  (bucket_id in ('atlas-media','atlas-avatars') and (storage.foldername(name))[1]=(select auth.uid())::text)
  or (bucket_id='atlas-media' and exists(select 1 from public.photos p where p.storage_path=storage.objects.name or p.thumbnail_path=storage.objects.name or p.motion_path=storage.objects.name))
  or (bucket_id='atlas-avatars' and exists(select 1 from public.profiles p where p.avatar_path=storage.objects.name and p.is_public))
);
drop policy if exists atlas_trip_media_read on storage.objects;
create policy atlas_trip_media_read on storage.objects for select to anon,authenticated using (bucket_id='atlas-trip-media' and (
  split_part(name,'/',1)=auth.uid()::text or exists(select 1 from public.trip_photos p where (p.storage_path=storage.objects.name or p.thumbnail_path=storage.objects.name or p.motion_path=storage.objects.name) and public.atlas_can_read_trip(p.trip_id))
));
drop policy if exists atlas_trip_media_delete on storage.objects;
create policy atlas_trip_media_delete on storage.objects for delete to authenticated using(bucket_id='atlas-trip-media' and split_part(name,'/',1)=auth.uid()::text
  and not exists(select 1 from public.trip_photos p where p.storage_path=storage.objects.name or p.thumbnail_path=storage.objects.name or p.motion_path=storage.objects.name));

create or replace function public.save_destination(
  p_id text, p_data jsonb, p_visibility text, p_expected_revision uuid, p_photos jsonb
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  owner uuid := auth.uid(); previous uuid; next_revision uuid := gen_random_uuid(); photo jsonb; kind text; motion text;
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
    kind := coalesce(photo->>'kind', 'image'); motion := photo->>'motion_path';
    if kind not in ('image','video','live') or (kind='live') is distinct from (motion is not null) then
      raise exception 'Invalid media kind or motion' using errcode='22023';
    end if;
    if not exists (select 1 from storage.objects where bucket_id = 'atlas-media' and name = photo->>'storage_path')
      or not exists (select 1 from storage.objects where bucket_id = 'atlas-media' and name = photo->>'thumbnail_path') or (motion is not null and not exists(select 1 from storage.objects where bucket_id='atlas-media' and name=motion)) then
      raise exception 'Missing media object' using errcode = '22023';
    end if;
    insert into public.photos(owner_id, destination_id, id, storage_path, thumbnail_path, caption, kind, motion_path, duration)
    values (owner, p_id, photo->>'id', photo->>'storage_path', photo->>'thumbnail_path', coalesce(photo->>'caption', ''), kind, motion, (photo->>'duration')::double precision);
  end loop;
  return next_revision;
end;
$$;

-- Keeps the legacy photo RPC intact for older clients.
create or replace function public.atlas_add_trip_media(p_trip uuid,p_id uuid,p_path text,p_caption text,p_kind text,p_thumbnail text,p_motion text,p_duration double precision)
returns void language plpgsql security definer set search_path='' as $$
declare prefix text := auth.uid()::text||'/'||p_trip::text||'/'||p_id::text;
begin
  perform 1 from public.trips where id=p_trip for update;
  if not public.atlas_trip_permission(p_trip,'photos') then raise exception 'ATLAS_TRIP_FORBIDDEN' using errcode='42501'; end if;
  if p_kind is null or p_kind not in ('video','live') or p_caption is null or length(p_caption)>500
    or p_duration is null or p_duration<=0 or not(p_duration<1000000000)
    or p_thumbnail is distinct from prefix||'-thumb.jpg'
    or (p_kind='live') is distinct from (p_motion is not null)
    or (p_kind='live' and p_path is distinct from prefix||'.jpg')
    or (p_kind='video' and (p_path is null or p_path not in (prefix||'.mp4',prefix||'.webm',prefix||'.mov')))
    or (p_motion is not null and p_motion not in (prefix||'-motion.mp4',prefix||'-motion.webm',prefix||'-motion.mov'))
    or not exists(select 1 from storage.objects where bucket_id='atlas-trip-media' and name=p_path)
    or not exists(select 1 from storage.objects where bucket_id='atlas-trip-media' and name=p_thumbnail)
    or (p_motion is not null and not exists(select 1 from storage.objects where bucket_id='atlas-trip-media' and name=p_motion))
    then raise exception 'ATLAS_TRIP_INVALID_PHOTO' using errcode='42501'; end if;
  if exists(select 1 from public.trip_photos where id=p_id and trip_id=p_trip and uploader_id=auth.uid() and storage_path=p_path
    and thumbnail_path=p_thumbnail and motion_path is not distinct from p_motion and kind=p_kind and duration=p_duration) then return; end if;
  if (select count(*) from public.trip_photos where trip_id=p_trip)>=100 then raise exception 'ATLAS_TRIP_PHOTO_LIMIT'; end if;
  insert into public.trip_photos(id,trip_id,uploader_id,storage_path,caption,kind,thumbnail_path,motion_path,duration)
  values(p_id,p_trip,auth.uid(),p_path,p_caption,p_kind,p_thumbnail,p_motion,p_duration);
end;
$$;
revoke all on function public.atlas_add_trip_media(uuid,uuid,text,text,text,text,text,double precision) from public,anon,authenticated;
grant execute on function public.atlas_add_trip_media(uuid,uuid,text,text,text,text,text,double precision) to authenticated;
notify pgrst,'reload schema';
commit;

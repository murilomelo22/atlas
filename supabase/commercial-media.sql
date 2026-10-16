-- Requires commercial-billing.sql. Derivatives preserve original files.
begin;
create table if not exists atlas_commercial.media_jobs (
 bucket text not null,path text not null,owner_id uuid not null references auth.users(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','processing','ready','failed')),
 attempts integer not null default 0,locked_until timestamptz,compressed_path text,thumbnail_path text,
 primary key(bucket,path)
);
alter table atlas_commercial.media_jobs enable row level security;
revoke all on atlas_commercial.media_jobs from public,anon,authenticated;
create or replace function atlas_commercial.queue_video()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.bucket_id in ('atlas-media','atlas-trip-media') and new.name not like '%/_derived/%'
 and (new.metadata->>'mimetype' like 'video/%' or new.name ~ '\.(mp4|mov|webm)$') then
  insert into atlas_commercial.media_jobs(bucket,path,owner_id) values(new.bucket_id,new.name,split_part(new.name,'/',1)::uuid) on conflict do nothing;
 end if;
 return new;
end;
$$;
revoke all on function atlas_commercial.queue_video() from public,anon,authenticated;
drop trigger if exists atlas_queue_video on storage.objects;
create trigger atlas_queue_video after insert on storage.objects for each row execute function atlas_commercial.queue_video();
commit;

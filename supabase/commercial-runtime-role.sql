-- Run after ALL commercial SQL, and repeat after adding a new table.
-- Creates no password and grants no membership to anon/authenticated.
begin;
do $$begin
 if not exists(select 1 from pg_roles where rolname='atlas_backend') then
  create role atlas_backend nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
 end if;
end$$;
grant usage on schema atlas_commercial,public,storage to atlas_backend;
do $$declare tbl record;begin
 for tbl in select tablename from pg_tables where schemaname='atlas_commercial' loop
  execute format('grant select on atlas_commercial.%I to atlas_backend',tbl.tablename);
  if tbl.tablename=any(array['accounts','subscriptions','events','revocations','deletion_jobs','consents','blocks','reports','telemetry_daily','telemetry_rate','media_jobs']) then
   execute format('grant insert,update,delete on atlas_commercial.%I to atlas_backend',tbl.tablename);
  end if;
  execute format('drop policy if exists commercial_backend on atlas_commercial.%I',tbl.tablename);
  execute format('create policy commercial_backend on atlas_commercial.%I for all to atlas_backend using(true) with check(true)',tbl.tablename);
 end loop;
 for tbl in select tablename from pg_tables where schemaname='public' and tablename=any(array['profiles','destinations','photos','wishlists','trips','trip_members','trip_photos','trip_publications','trip_saves','trip_join_requests']) loop
  execute format('grant select on public.%I to atlas_backend',tbl.tablename);
  execute format('drop policy if exists commercial_backend_export on public.%I',tbl.tablename);
  execute format('create policy commercial_backend_export on public.%I for select to atlas_backend using(true)',tbl.tablename);
 end loop;
end$$;
grant select on storage.objects to atlas_backend;
drop policy if exists commercial_backend_export on storage.objects;
create policy commercial_backend_export on storage.objects for select to atlas_backend using(bucket_id in ('atlas-media','atlas-trip-media','atlas-avatars'));
commit;

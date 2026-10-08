-- Run AFTER schema.sql in the SQL Editor. Fixtures are rolled back.
-- Tests the actual RLS tables, storage policies and invoker RPC in your project.
begin;
insert into auth.users(id, email, raw_user_meta_data) values
  ('10000000-0000-4000-8000-000000000001', 'atlas-policy-a@example.invalid', '{"display_name":"Pessoa A"}'),
  ('10000000-0000-4000-8000-000000000002', 'atlas-policy-b@example.invalid', '{"display_name":"Pessoa B"}');
update public.profiles set username = 'atlas_policy_a' where id = '10000000-0000-4000-8000-000000000001';
update public.profiles set username = 'atlas_policy_b' where id = '10000000-0000-4000-8000-000000000002';
insert into public.destinations(owner_id, id, visibility, data) values
  ('10000000-0000-4000-8000-000000000001','private-test','private','{"name":"Privada","lat":48,"lng":2,"notes":"","rating":0,"visits":[],"tags":[],"photoIds":[]}'),
  ('10000000-0000-4000-8000-000000000001','public-test','public','{"name":"Pública","lat":48,"lng":2,"notes":"","rating":0,"visits":[],"tags":[],"photoIds":[]}');
insert into storage.objects(bucket_id, name) values
  ('atlas-media', '10000000-0000-4000-8000-000000000001/policy-private.jpg'),
  ('atlas-media', '10000000-0000-4000-8000-000000000001/policy-public.jpg');
insert into public.photos(owner_id,destination_id,id,storage_path,thumbnail_path) values
  ('10000000-0000-4000-8000-000000000001','private-test','private-photo','10000000-0000-4000-8000-000000000001/policy-private.jpg','10000000-0000-4000-8000-000000000001/policy-private.jpg'),
  ('10000000-0000-4000-8000-000000000001','public-test','public-photo','10000000-0000-4000-8000-000000000001/policy-public.jpg','10000000-0000-4000-8000-000000000001/policy-public.jpg');

set local role anon;
do $$ begin
  if (select count(*) from public.destinations where id in ('private-test','public-test')) <> 1 then raise exception 'FAIL anonymous destinations'; end if;
  if (select count(*) from public.photos where id in ('private-photo','public-photo')) <> 1 then raise exception 'FAIL anonymous photos'; end if;
  if exists (select 1 from storage.objects where name like '%/policy-private.jpg') then raise exception 'FAIL private image exposed'; end if;
  if not exists (select 1 from storage.objects where name like '%/policy-public.jpg') then raise exception 'FAIL public image denied'; end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare affected integer; begin
  if exists (select 1 from public.destinations where id = 'private-test') then raise exception 'FAIL another account reads private post'; end if;
  update public.destinations set visibility = 'public' where id = 'private-test';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL another account edits post'; end if;
  delete from public.destinations where id = 'public-test';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL another account deletes post'; end if;
  begin
    insert into public.destinations(owner_id,id,data) values ('10000000-0000-4000-8000-000000000001','forged','{"name":"Falsificada","lat":48,"lng":2,"notes":"","rating":0,"visits":[],"tags":[],"photoIds":[]}');
    raise exception 'FAIL forged ownership';
  exception when insufficient_privilege then null; end;
  begin
    insert into storage.objects(bucket_id,name) values ('atlas-media','10000000-0000-4000-8000-000000000001/forged.jpg');
    raise exception 'FAIL forged storage ownership';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare revision uuid; next_revision uuid; begin
  if (select count(*) from public.destinations where id in ('private-test','public-test')) <> 2 then raise exception 'FAIL owner cannot read'; end if;
  select d.revision into revision from public.destinations d where id = 'private-test';
  select public.save_destination('private-test','{"name":"Editada","lat":48,"lng":2,"notes":"","rating":0,"visits":[],"tags":[],"photoIds":[]}', 'private', revision, '[]') into next_revision;
  if revision = next_revision then raise exception 'FAIL revision not changed'; end if;
  begin
    perform public.save_destination('private-test','{"name":"Conflito","lat":48,"lng":2,"notes":"","rating":0,"visits":[],"tags":[],"photoIds":[]}', 'private', revision, '[]');
    raise exception 'FAIL stale write accepted';
  exception when serialization_failure then null; end;
  update public.profiles set is_public = false where id = auth.uid();
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);
do $$ begin
  if exists(select 1 from public.profiles where username = 'atlas_policy_a') then raise exception 'FAIL private profile exposed'; end if;
  if exists(select 1 from public.destinations where id = 'public-test') then raise exception 'FAIL private profile exposes posts'; end if;
  if exists(select 1 from storage.objects where name like '%/policy-public.jpg') then raise exception 'FAIL private profile exposes images'; end if;
end $$;
reset role;
rollback;
select 'PASS: ownership, private/public profiles, posts, photos and revision conflicts' as result;

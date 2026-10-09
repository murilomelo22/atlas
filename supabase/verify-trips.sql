-- Execute depois de trips.sql. Todos os dados de teste são desfeitos.
begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('20000000-0000-4000-8000-000000000001','atlas-trip-a@example.invalid','{"display_name":"Organizador"}'),
 ('20000000-0000-4000-8000-000000000002','atlas-trip-b@example.invalid','{"display_name":"Convidado"}'),
 ('20000000-0000-4000-8000-000000000003','atlas-trip-c@example.invalid','{"display_name":"Visitante"}');
update public.profiles set username='atlas_trip_test_a' where id='20000000-0000-4000-8000-000000000001';
update public.profiles set username='atlas_trip_test_b' where id='20000000-0000-4000-8000-000000000002';
insert into storage.objects(bucket_id,name) values
 ('atlas-trip-covers','20000000-0000-4000-8000-000000000001/trip-test.jpg'),
 ('atlas-trip-covers','20000000-0000-4000-8000-000000000001/unrelated-private.jpg');
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.atlas_save_trip('20000000-0000-4000-8000-000000000010',null,'Trip de teste','','20000000-0000-4000-8000-000000000001/trip-test.jpg',false,
 '[{"name":"Paris","lat":48.85,"lng":2.35,"date":"2026-10-09","notes":"Museus"}]');
select public.atlas_invite_trip('20000000-0000-4000-8000-000000000010','atlas_trip_test_b','editor');
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);
do $$ begin
 if exists(select 1 from public.trips where id='20000000-0000-4000-8000-000000000010') then raise exception 'FAIL anonymous private trip'; end if;
 if exists(select 1 from storage.objects where name='20000000-0000-4000-8000-000000000001/trip-test.jpg') then raise exception 'FAIL anonymous private cover'; end if;
 begin perform public.atlas_trip_people('20000000-0000-4000-8000-000000000010');raise exception 'FAIL anonymous participant access';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 if exists(select 1 from public.trips where id='20000000-0000-4000-8000-000000000010') then raise exception 'FAIL outsider reads private trip';end if;
 begin perform public.atlas_invite_trip('20000000-0000-4000-8000-000000000010','atlas_trip_test_b','editor');raise exception 'FAIL outsider invites';exception when insufficient_privilege then null;end;
 begin perform public.atlas_respond_trip_invite('20000000-0000-4000-8000-000000000010',true);raise exception 'FAIL self join without invitation';exception when insufficient_privilege then null;end;
 begin insert into public.trip_members(trip_id,user_id,role,status) values('20000000-0000-4000-8000-000000000010',auth.uid(),'editor','accepted');raise exception 'FAIL direct member insert';exception when insufficient_privilege then null;end;
 begin insert into storage.objects(bucket_id,name) values('atlas-trip-covers','20000000-0000-4000-8000-000000000001/forged.jpg');raise exception 'FAIL forged cover';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare t public.trips; result jsonb; begin
 select * into t from public.trips where id='20000000-0000-4000-8000-000000000010';
 if t.id is null then raise exception 'FAIL invited cannot preview';end if;
 begin perform public.atlas_save_trip(t.id,t.revision,'Antes de aceitar','',t.cover_path,false,t.stops);raise exception 'FAIL edit before acceptance';exception when insufficient_privilege then null;end;
 perform public.atlas_respond_trip_invite(t.id,true);
 result:=public.atlas_save_trip(t.id,t.revision,'Editado pelo participante','',t.cover_path,false,t.stops);
 if result->>'name'<>'Editado pelo participante' then raise exception 'FAIL accepted editor';end if;
 begin perform public.atlas_save_trip(t.id,t.revision,'Conflito','',t.cover_path,false,t.stops);raise exception 'FAIL stale revision';exception when serialization_failure then null;end;
 select * into t from public.trips where id=t.id;
 begin perform public.atlas_save_trip(t.id,t.revision,t.name,'',t.cover_path,true,t.stops);raise exception 'FAIL editor publishes';exception when insufficient_privilege then null;end;
 begin perform public.atlas_delete_trip(t.id,t.revision);raise exception 'FAIL editor deletes';exception when insufficient_privilege then null;end;
 begin perform public.atlas_invite_trip(t.id,'atlas_trip_test_a','viewer');raise exception 'FAIL editor invites';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.atlas_invite_trip('20000000-0000-4000-8000-000000000010','atlas_trip_test_b','viewer');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare t public.trips;begin
 select * into t from public.trips where id='20000000-0000-4000-8000-000000000010';
 begin perform public.atlas_save_trip(t.id,t.revision,'Viewer cannot edit','',t.cover_path,false,t.stops);raise exception 'FAIL viewer edits';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.atlas_remove_trip_member('20000000-0000-4000-8000-000000000010','20000000-0000-4000-8000-000000000002');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 if exists(select 1 from public.trips where id='20000000-0000-4000-8000-000000000010') then raise exception 'FAIL removed member reads';end if;
 if exists(select 1 from storage.objects where name='20000000-0000-4000-8000-000000000001/trip-test.jpg') then raise exception 'FAIL removed member cover';end if;
end $$;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare t public.trips;begin
 select * into t from public.trips where id='20000000-0000-4000-8000-000000000010';
 -- A name matching a path must not broaden the storage policy's scope.
 perform public.atlas_save_trip(t.id,t.revision,t.cover_path,t.notes,t.cover_path,true,t.stops);
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);
do $$ begin
 if not exists(select 1 from public.trips where id='20000000-0000-4000-8000-000000000010') then raise exception 'FAIL public trip';end if;
 if not exists(select 1 from storage.objects where name='20000000-0000-4000-8000-000000000001/trip-test.jpg') then raise exception 'FAIL public cover';end if;
 if exists(select 1 from storage.objects where name='20000000-0000-4000-8000-000000000001/unrelated-private.jpg') then raise exception 'FAIL unrelated private cover exposed';end if;
 begin perform public.atlas_trip_people('20000000-0000-4000-8000-000000000010');raise exception 'FAIL public participant list';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select 'PASS: trips, invitations, roles, covers and revisions' as result;

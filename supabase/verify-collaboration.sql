-- Execute depois de collaboration.sql. Fixtures e objetos são desfeitos pelo ROLLBACK.
begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('30000000-0000-4000-8000-000000000001','atlas-collab-owner@example.invalid','{}'),
 ('30000000-0000-4000-8000-000000000002','atlas-collab-member@example.invalid','{}'),
 ('30000000-0000-4000-8000-000000000003','atlas-collab-outsider@example.invalid','{}');
update public.profiles set username='atlas_collab_test_owner',is_public=true where id='30000000-0000-4000-8000-000000000001';
update public.profiles set username='atlas_collab_test_member',is_public=true where id='30000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.atlas_save_trip('30000000-0000-4000-8000-000000000010',null,'Teste colaboração','',null,false,
 '[{"id":"paris","name":"Paris","lat":48.85,"lng":2.35,"date":"2025-01-01","notes":""}]');
select public.atlas_invite_trip_permissions('30000000-0000-4000-8000-000000000010','atlas_collab_test_member',false,true,true,true);
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 if public.atlas_trip_permission('30000000-0000-4000-8000-000000000010','photos') then raise exception 'FAIL invited permission';end if;
 begin insert into storage.objects(bucket_id,name) values('atlas-trip-media','30000000-0000-4000-8000-000000000002/30000000-0000-4000-8000-000000000010/invited.jpg');raise exception 'FAIL invited upload';exception when insufficient_privilege then null;end;
 perform public.atlas_respond_trip_invite('30000000-0000-4000-8000-000000000010',true);
end $$;
do $$ declare t public.trips;result jsonb;begin
 select * into t from public.trips where id='30000000-0000-4000-8000-000000000010';
 result:=public.atlas_save_trip(t.id,t.revision,t.name,'Descrição permitida',t.cover_path,false,jsonb_set(t.stops,'{0,notes}','"Plano permitido"'));
 if result->>'notes'<>'Descrição permitida' then raise exception 'FAIL description permission';end if;
 select * into t from public.trips where id=t.id;
 begin perform public.atlas_save_trip(t.id,t.revision,'Renomear sem permissão',t.notes,t.cover_path,false,t.stops);raise exception 'FAIL name permission';exception when insufficient_privilege then null;end;
 begin perform public.atlas_save_trip(t.id,t.revision,t.name,t.notes,t.cover_path,false,jsonb_set(t.stops,'{0,lat}','49'));raise exception 'FAIL itinerary permission';exception when insufficient_privilege then null;end;
 begin perform public.atlas_save_trip(t.id,t.revision,t.name,t.notes,t.cover_path,true,t.stops);raise exception 'FAIL collaborator privatization';exception when insufficient_privilege then null;end;
 begin perform public.atlas_set_trip_permissions(t.id,auth.uid(),true,true,true,true);raise exception 'FAIL self escalation';exception when insufficient_privilege then null;end;
 begin update public.trip_members set can_edit_itinerary=true where trip_id=t.id;raise exception 'FAIL direct escalation';exception when insufficient_privilege then null;end;
 begin perform public.atlas_publish_trip_profile(t.id,true);raise exception 'FAIL private profile publication';exception when raise_exception then if SQLERRM<>'ATLAS_TRIP_PUBLISH_PUBLIC' then raise;end if;end;
end $$;
insert into storage.objects(bucket_id,name) values('atlas-trip-media','30000000-0000-4000-8000-000000000002/30000000-0000-4000-8000-000000000010/30000000-0000-4000-8000-000000000020.jpg');
select public.atlas_add_trip_photo('30000000-0000-4000-8000-000000000010','30000000-0000-4000-8000-000000000020','30000000-0000-4000-8000-000000000002/30000000-0000-4000-8000-000000000010/30000000-0000-4000-8000-000000000020.jpg','Minha foto');
-- Retrying a confirmed upload must not duplicate the metadata.
select public.atlas_add_trip_photo('30000000-0000-4000-8000-000000000010','30000000-0000-4000-8000-000000000020','30000000-0000-4000-8000-000000000002/30000000-0000-4000-8000-000000000010/30000000-0000-4000-8000-000000000020.jpg','Minha foto');
do $$ begin
 if (select count(*) from public.trip_photos where trip_id='30000000-0000-4000-8000-000000000010')<>1 then raise exception 'FAIL photo retry';end if;
 begin perform public.atlas_add_trip_photo('30000000-0000-4000-8000-000000000010','30000000-0000-4000-8000-000000000021','30000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000010/30000000-0000-4000-8000-000000000021.jpg','Forged');raise exception 'FAIL forged photo';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);
do $$ begin
 if exists(select 1 from public.trip_photos where trip_id='30000000-0000-4000-8000-000000000010') then raise exception 'FAIL private gallery';end if;
 if exists(select 1 from storage.objects where bucket_id='atlas-trip-media' and name='30000000-0000-4000-8000-000000000002/30000000-0000-4000-8000-000000000010/30000000-0000-4000-8000-000000000020.jpg') then raise exception 'FAIL private photo storage';end if;
 begin perform public.atlas_trip_collaborators('30000000-0000-4000-8000-000000000010');raise exception 'FAIL public collaborators';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 begin insert into storage.objects(bucket_id,name) values('atlas-trip-media','30000000-0000-4000-8000-000000000003/30000000-0000-4000-8000-000000000010/outsider.jpg');raise exception 'FAIL outsider upload';exception when insufficient_privilege then null;end;
 begin perform public.atlas_remove_trip_photo('30000000-0000-4000-8000-000000000020');raise exception 'FAIL outsider deletes';exception when insufficient_privilege then null;end;
 begin perform public.atlas_publish_trip_profile('30000000-0000-4000-8000-000000000010',true);raise exception 'FAIL outsider publication';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare t public.trips;begin
 select * into t from public.trips where id='30000000-0000-4000-8000-000000000010';
 perform public.atlas_save_trip(t.id,t.revision,t.name,t.notes,t.cover_path,true,t.stops);
 perform public.atlas_set_trip_permissions(t.id,'30000000-0000-4000-8000-000000000002',true,false,false,true);
end $$;
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare t public.trips;begin
 select * into t from public.trips where id='30000000-0000-4000-8000-000000000010';
 perform public.atlas_save_trip(t.id,t.revision,'Roteiro permitido',t.notes,t.cover_path,t.is_public,jsonb_set(t.stops,'{0,lat}','49'));
 select * into t from public.trips where id=t.id;
 begin perform public.atlas_save_trip(t.id,t.revision,t.name,'Descrição bloqueada',t.cover_path,t.is_public,t.stops);raise exception 'FAIL description revocation';exception when insufficient_privilege then null;end;
 begin perform public.atlas_save_trip(t.id,t.revision,t.name,t.notes,t.cover_path,t.is_public,jsonb_set(t.stops,'{0,notes}','"Bloqueado"'));raise exception 'FAIL stop description';exception when insufficient_privilege then null;end;
 begin insert into storage.objects(bucket_id,name) values('atlas-trip-media','30000000-0000-4000-8000-000000000002/30000000-0000-4000-8000-000000000010/revoked.jpg');raise exception 'FAIL upload revocation';exception when insufficient_privilege then null;end;
 perform public.atlas_publish_trip_profile(t.id,true);
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);
do $$ begin
 if not exists(select 1 from public.trip_publications where trip_id='30000000-0000-4000-8000-000000000010' and user_id='30000000-0000-4000-8000-000000000002') then raise exception 'FAIL public profile trip';end if;
 if not exists(select 1 from public.trip_photos where id='30000000-0000-4000-8000-000000000020') then raise exception 'FAIL public gallery';end if;
 if not exists(select 1 from storage.objects where name='30000000-0000-4000-8000-000000000002/30000000-0000-4000-8000-000000000010/30000000-0000-4000-8000-000000000020.jpg') then raise exception 'FAIL public gallery storage';end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.atlas_set_trip_permissions('30000000-0000-4000-8000-000000000010','30000000-0000-4000-8000-000000000002',true,false,false,false);
reset role;
do $$ begin
 if exists(select 1 from public.trip_publications where trip_id='30000000-0000-4000-8000-000000000010') then raise exception 'FAIL publication revocation';end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.atlas_set_trip_permissions('30000000-0000-4000-8000-000000000010','30000000-0000-4000-8000-000000000002',true,false,false,true);
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.atlas_publish_trip_profile('30000000-0000-4000-8000-000000000010',true);
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare t public.trips;begin
 select * into t from public.trips where id='30000000-0000-4000-8000-000000000010';
 perform public.atlas_save_trip(t.id,t.revision,t.name,t.notes,t.cover_path,false,t.stops);
end $$;
reset role;
do $$ begin
 if exists(select 1 from public.trip_publications where trip_id='30000000-0000-4000-8000-000000000010') then raise exception 'FAIL privatization cleanup';end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.atlas_remove_trip_photo('30000000-0000-4000-8000-000000000020');
select public.atlas_remove_trip_member('30000000-0000-4000-8000-000000000010','30000000-0000-4000-8000-000000000002');
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 if exists(select 1 from public.trips where id='30000000-0000-4000-8000-000000000010') then raise exception 'FAIL removed access';end if;
 if public.atlas_trip_permission('30000000-0000-4000-8000-000000000010','publish') then raise exception 'FAIL removed permission';end if;
end $$;
reset role;
rollback;
select 'PASS: collaboration permissions, photos and profile publications' as result;

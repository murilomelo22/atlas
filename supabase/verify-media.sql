-- Execute AFTER media.sql in Supabase SQL Editor. No fixtures are retained.
begin;
select set_config('atlas.test.owner',gen_random_uuid()::text,true),
       set_config('atlas.test.member',gen_random_uuid()::text,true),
       set_config('atlas.test.trip',gen_random_uuid()::text,true),
       set_config('atlas.test.live',gen_random_uuid()::text,true),
       set_config('atlas.test.video',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data)
select current_setting('atlas.test.'||person)::uuid,'atlas-media-'||current_setting('atlas.test.'||person)||'@example.invalid','{}'::jsonb from unnest(array['owner','member']) as people(person);
-- Random UUIDs avoid username-prefix collisions even on an older auth trigger.
update public.profiles set is_public=true where id in (current_setting('atlas.test.owner')::uuid,current_setting('atlas.test.member')::uuid);
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('atlas.test.owner'),true),
       set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('atlas.test.owner'),'role','authenticated')::text,true);
insert into storage.objects(bucket_id,name)
select 'atlas-media',auth.uid()::text||'/media-verify/'||suffix from unnest(array['private.jpg','private-thumb.jpg','private-motion.mp4','public.mp4','public-thumb.jpg']) as objects(suffix);
select public.save_destination('media-private',
 '{"name":"Live privada","lat":48.85,"lng":2.35,"notes":"","rating":0,"visits":[],"tags":[],"photoIds":["live"],"coverId":"live"}',
 'private',null,jsonb_build_array(jsonb_build_object('id','live','kind','live','duration',2,
 'storage_path',auth.uid()::text||'/media-verify/private.jpg','thumbnail_path',auth.uid()::text||'/media-verify/private-thumb.jpg','motion_path',auth.uid()::text||'/media-verify/private-motion.mp4')));
select public.save_destination('media-public',
 '{"name":"Vídeo público","lat":48.85,"lng":2.35,"notes":"","rating":0,"visits":[],"tags":[],"photoIds":["video"],"coverId":"video"}',
 'public',null,jsonb_build_array(jsonb_build_object('id','video','kind','video','duration',2,
 'storage_path',auth.uid()::text||'/media-verify/public.mp4','thumbnail_path',auth.uid()::text||'/media-verify/public-thumb.jpg')));
do $$ declare revision uuid; begin
 select d.revision into revision from public.destinations d where owner_id=auth.uid() and id='media-private';
 if not exists(select 1 from public.photos where owner_id=auth.uid() and id='live' and kind='live' and motion_path is not null) then raise exception 'FAIL live metadata';end if;
 begin
  perform public.save_destination('media-private','{"name":"Inválido","lat":48.85,"lng":2.35,"notes":"","rating":0,"visits":[],"tags":[],"photoIds":[]}', 'private',revision,
   jsonb_build_array(jsonb_build_object('id','invalid','kind','live','duration',2,'storage_path',auth.uid()::text||'/media-verify/private.jpg','thumbnail_path',auth.uid()::text||'/media-verify/private-thumb.jpg','motion_path',auth.uid()::text||'/media-verify/missing.mp4')));
  raise exception 'FAIL missing motion accepted';
 exception when invalid_parameter_value then null;end;
 if (select d.revision from public.destinations d where owner_id=auth.uid() and id='media-private')<>revision then raise exception 'FAIL non-atomic media save';end if;
 begin
  update public.photos set motion_path=current_setting('atlas.test.member')||'/foreign.mp4' where owner_id=auth.uid() and id='live';raise exception 'FAIL foreign motion';
 exception when check_violation then null;end;
 begin update public.photos set kind='video' where owner_id=auth.uid() and id='live';raise exception 'FAIL mismatched kind';exception when check_violation then null;end;
end $$;
select public.atlas_save_trip(current_setting('atlas.test.trip')::uuid,null,'Teste mídias','',null,false,
 '[{"id":"paris","name":"Paris","lat":48.85,"lng":2.35,"date":"","notes":""}]');
select public.atlas_invite_trip_permissions(current_setting('atlas.test.trip')::uuid,(select username from public.profiles where id=current_setting('atlas.test.member')::uuid),false,false,true,false);
insert into storage.objects(bucket_id,name)
select 'atlas-trip-media',auth.uid()::text||'/'||current_setting('atlas.test.trip')||'/'||current_setting('atlas.test.live')||suffix from unnest(array['.jpg','-thumb.jpg','-motion.mp4']) as objects(suffix);
select public.atlas_add_trip_media(current_setting('atlas.test.trip')::uuid,current_setting('atlas.test.live')::uuid,
 auth.uid()::text||'/'||current_setting('atlas.test.trip')||'/'||current_setting('atlas.test.live')||'.jpg','Live da trip','live',
 auth.uid()::text||'/'||current_setting('atlas.test.trip')||'/'||current_setting('atlas.test.live')||'-thumb.jpg',
 auth.uid()::text||'/'||current_setting('atlas.test.trip')||'/'||current_setting('atlas.test.live')||'-motion.mp4',2);
-- Retry cannot duplicate metadata or change an existing item.
select public.atlas_add_trip_media(current_setting('atlas.test.trip')::uuid,current_setting('atlas.test.live')::uuid,
 auth.uid()::text||'/'||current_setting('atlas.test.trip')||'/'||current_setting('atlas.test.live')||'.jpg','Live da trip','live',
 auth.uid()::text||'/'||current_setting('atlas.test.trip')||'/'||current_setting('atlas.test.live')||'-thumb.jpg',
 auth.uid()::text||'/'||current_setting('atlas.test.trip')||'/'||current_setting('atlas.test.live')||'-motion.mp4',2);
do $$ begin
 if (select count(*) from public.trip_photos where trip_id=current_setting('atlas.test.trip')::uuid)<>1 then raise exception 'FAIL retry';end if;
 -- Older Storage versions filter linked objects through RLS (zero rows deleted).
 -- Newer versions also reject direct SQL deletion with SQLSTATE 42501.
 -- Both outcomes must retain the linked object; never disable protect_delete.
 begin
  delete from storage.objects where bucket_id='atlas-trip-media' and name=auth.uid()::text||'/'||current_setting('atlas.test.trip')||'/'||current_setting('atlas.test.live')||'-motion.mp4';
 exception when insufficient_privilege then null;
 end;
 if not exists(select 1 from storage.objects where bucket_id='atlas-trip-media' and name=auth.uid()::text||'/'||current_setting('atlas.test.trip')||'/'||current_setting('atlas.test.live')||'-motion.mp4') then raise exception 'FAIL linked motion deleted';end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('atlas.test.member'),true),
       set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('atlas.test.member'),'role','authenticated')::text,true);
do $$ begin
 if exists(select 1 from public.photos where owner_id=current_setting('atlas.test.owner')::uuid and id='live') then raise exception 'FAIL personal private media read';end if;
 begin insert into storage.objects(bucket_id,name) values('atlas-trip-media',auth.uid()::text||'/'||current_setting('atlas.test.trip')||'/invited.mp4');raise exception 'FAIL invited upload';exception when insufficient_privilege then null;end;
 perform public.atlas_respond_trip_invite(current_setting('atlas.test.trip')::uuid,true);
end $$;
insert into storage.objects(bucket_id,name)
select 'atlas-trip-media',auth.uid()::text||'/'||current_setting('atlas.test.trip')||'/'||current_setting('atlas.test.video')||suffix from unnest(array['.mp4','-thumb.jpg']) as objects(suffix);
select public.atlas_add_trip_media(current_setting('atlas.test.trip')::uuid,current_setting('atlas.test.video')::uuid,
 auth.uid()::text||'/'||current_setting('atlas.test.trip')||'/'||current_setting('atlas.test.video')||'.mp4','Vídeo colaborador','video',
 auth.uid()::text||'/'||current_setting('atlas.test.trip')||'/'||current_setting('atlas.test.video')||'-thumb.jpg',null,2);
do $$ begin
 begin perform public.atlas_add_trip_media(current_setting('atlas.test.trip')::uuid,gen_random_uuid(),
  current_setting('atlas.test.owner')||'/'||current_setting('atlas.test.trip')||'/'||current_setting('atlas.test.live')||'.jpg','Forged','live',
  current_setting('atlas.test.owner')||'/'||current_setting('atlas.test.trip')||'/'||current_setting('atlas.test.live')||'-thumb.jpg',
  current_setting('atlas.test.owner')||'/'||current_setting('atlas.test.trip')||'/'||current_setting('atlas.test.live')||'-motion.mp4',2);
  raise exception 'FAIL forged trip motion';exception when insufficient_privilege then null;end;
 begin update public.trip_photos set caption='Direct tamper' where trip_id=current_setting('atlas.test.trip')::uuid;raise exception 'FAIL direct write';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true);
do $$ begin
 if exists(select 1 from storage.objects where bucket_id='atlas-media' and name=current_setting('atlas.test.owner')||'/media-verify/private-motion.mp4') then raise exception 'FAIL anonymous private motion';end if;
 if (select count(*) from storage.objects where bucket_id='atlas-media' and name in (current_setting('atlas.test.owner')||'/media-verify/public.mp4',current_setting('atlas.test.owner')||'/media-verify/public-thumb.jpg'))<>2 then raise exception 'FAIL public video/thumbnail read';end if;
 if exists(select 1 from storage.objects where bucket_id='atlas-trip-media' and split_part(name,'/',2)=current_setting('atlas.test.trip')) then raise exception 'FAIL private trip media read';end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('atlas.test.owner'),true),
       set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('atlas.test.owner'),'role','authenticated')::text,true);
select public.atlas_set_trip_permissions(current_setting('atlas.test.trip')::uuid,current_setting('atlas.test.member')::uuid,false,false,false,false);
do $$ declare trip public.trips; begin
 select * into trip from public.trips where id=current_setting('atlas.test.trip')::uuid;
 perform public.atlas_save_trip(trip.id,trip.revision,trip.name,trip.notes,trip.cover_path,true,trip.stops);
end $$;
select set_config('request.jwt.claim.sub',current_setting('atlas.test.member'),true),
       set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('atlas.test.member'),'role','authenticated')::text,true);
do $$ begin
 begin perform public.atlas_add_trip_media(current_setting('atlas.test.trip')::uuid,current_setting('atlas.test.video')::uuid,
  auth.uid()::text||'/'||current_setting('atlas.test.trip')||'/'||current_setting('atlas.test.video')||'.mp4','Retry after revocation','video',
  auth.uid()::text||'/'||current_setting('atlas.test.trip')||'/'||current_setting('atlas.test.video')||'-thumb.jpg',null,2);
  raise exception 'FAIL revoked media add';exception when insufficient_privilege then null;end;
 begin perform public.atlas_remove_trip_photo(current_setting('atlas.test.video')::uuid);raise exception 'FAIL revoked media remove';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true);
do $$ begin
 if (select count(*) from storage.objects where bucket_id='atlas-trip-media' and name in (
  current_setting('atlas.test.owner')||'/'||current_setting('atlas.test.trip')||'/'||current_setting('atlas.test.live')||'-motion.mp4',
  current_setting('atlas.test.owner')||'/'||current_setting('atlas.test.trip')||'/'||current_setting('atlas.test.live')||'-thumb.jpg',
  current_setting('atlas.test.member')||'/'||current_setting('atlas.test.trip')||'/'||current_setting('atlas.test.video')||'.mp4'))<>3 then raise exception 'FAIL public trip media read';end if;
end $$;
reset role;
-- Administrative final privacy change checks the new policies without deleting fixtures first.
update public.profiles set is_public=false where id=current_setting('atlas.test.owner')::uuid;
update public.trips set is_public=false where id=current_setting('atlas.test.trip')::uuid;
set local role anon;
do $$ begin
 if exists(select 1 from storage.objects where bucket_id='atlas-media' and name=current_setting('atlas.test.owner')||'/media-verify/public.mp4') then raise exception 'FAIL hidden profile video read';end if;
 if exists(select 1 from storage.objects where bucket_id='atlas-trip-media' and split_part(name,'/',2)=current_setting('atlas.test.trip')) then raise exception 'FAIL privatized trip media read';end if;
end $$;
reset role;
select 'PASS: mídias, privacidade e permissões' as resultado;
rollback;

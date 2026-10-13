import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Real PostgreSQL executes the repository's complete schema and RLS. The small
// auth/storage stubs provide only the Supabase platform schemas, not app ACLs.
const db = new PGlite();
const alice='10000000-0000-4000-8000-000000000001',bob='10000000-0000-4000-8000-000000000002',charlie='10000000-0000-4000-8000-000000000003';
const shared='50000000-0000-4000-8000-000000000001',privateTrip='50000000-0000-4000-8000-000000000002';
const alicePhoto='60000000-0000-4000-8000-000000000001',bobPhoto='60000000-0000-4000-8000-000000000002',privatePhoto='60000000-0000-4000-8000-000000000003';
let checks=0;
async function actor(role,id=''){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec(`set role ${role}`);}
async function scalar(sql,args=[]){return (await db.query(sql,args)).rows[0].value;}
async function blocked(sql,args=[],codes=['42501']){await assert.rejects(db.query(sql,args),error=>codes.includes(error.code));checks++;}
function equal(actual,expected){assert.deepEqual(actual,expected);checks++;}
try {
  await db.exec(`create role anon; create role authenticated; create schema auth; create schema storage;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb not null default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to anon,authenticated;
    create table storage.buckets(id text primary key,name text,public boolean default false,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,primary key(bucket_id,name));
    create function storage.foldername(path text) returns text[] language sql immutable as $$select (string_to_array(path,'/'))[1:array_length(string_to_array(path,'/'),1)-1]$$;
    alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated;grant select,insert,update,delete on storage.objects to anon,authenticated;`);
  for(const file of ['schema.sql','trips.sql','collaboration.sql','media.sql'])await db.exec(await readFile(new URL(`../supabase/${file}`,import.meta.url),'utf8'));
  const files=await readdir(new URL('../supabase/migrations/',import.meta.url));
  const migration=await readFile(new URL(`../supabase/migrations/${files.find(file=>file.endsWith('_atlas_trip_view_sharing.sql'))}`,import.meta.url),'utf8');
  await db.exec(migration);await db.exec(migration);
  for(const [id,name] of [[alice,'Alice'],[bob,'Bob privado'],[charlie,'Charlie privado']]){
    await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3::jsonb)',[id,`${id}@test.invalid`,JSON.stringify({display_name:name})]);
  }
  const stops=JSON.stringify([{id:'spain',name:'Espanha',lat:40,lng:-3,date:'2024-05-01',notes:''},{id:'italy',name:'Itália',lat:41.9,lng:12.5,date:'2024-05-04',notes:''}]);
  await db.query('insert into public.trips(id,owner_id,name,is_public,stops) values($1,$2,$3,true,$4::jsonb),($5,$2,$6,false,$4::jsonb)',[shared,alice,'Trip compartilhada',stops,privateTrip,'Trip privada']);
  for(const [id,user,trip] of [[alicePhoto,alice,shared],[bobPhoto,bob,shared],[privatePhoto,alice,privateTrip]]){
    const path=`${user}/${trip}/${id}.jpg`;await db.query("insert into storage.objects(bucket_id,name) values('atlas-trip-media',$1)",[path]);await db.query('insert into public.trip_photos(id,trip_id,uploader_id,storage_path) values($1,$2,$3,$4)',[id,trip,user,path]);
  }
  await db.query("insert into public.destinations(id,owner_id,data,visibility) values('secret-review',$1,$2::jsonb, 'private')",[alice,JSON.stringify({name:'Avaliação privada',lat:48.85,lng:2.35,visits:[],tags:[],photoIds:[],notes:'Privado',rating:5})]);
  await actor('anon');
  equal(await scalar('select count(*)::int as value from public.trips'),1);
  equal(await scalar('select count(*)::int as value from public.trip_photos'),2);
  equal(await scalar('select count(*)::int as value from public.destinations'),0);
  await blocked('select public.atlas_request_trip_join($1)',[shared]);
  await blocked('select public.atlas_save_trip_link($1,true)',[shared]);
  await blocked('select * from public.trip_join_requests');
  await blocked('select * from atlas_internal.list_trip_requests($1)',[shared]);

  await actor('authenticated',bob);
  equal(await scalar('select public.atlas_save_trip_link($1,true) as value',[shared]),true);
  equal(await scalar('select public.atlas_save_trip_link($1,true) as value',[shared]),true);
  equal(await scalar('select count(*)::int as value from public.trip_saves'),1);
  await blocked('select public.atlas_save_trip_link($1,true)',[privateTrip]);
  await blocked('insert into public.trip_saves(user_id,trip_id) values($1,$2)',[alice,shared]);
  equal(await scalar('select public.atlas_request_trip_join($1) as value',[shared]),'pending');
  equal(await scalar('select public.atlas_request_trip_join($1) as value',[shared]),'pending');
  equal(await scalar('select count(*)::int as value from public.trip_join_requests'),1);
  await blocked('select public.atlas_request_trip_join($1)',[privateTrip]);
  await blocked("update public.trip_join_requests set status='approved' where trip_id=$1",[shared]);
  await blocked("insert into public.trip_members(trip_id,user_id,role,status) values($1,$2,'editor','accepted')",[shared,bob]);
  await blocked('select public.atlas_respond_trip_request($1,$2,true)',[shared,bob]);
  await blocked('select public.atlas_trip_requests($1)',[shared]);

  await actor('authenticated',charlie);
  equal(await scalar('select count(*)::int as value from public.trip_saves'),0);
  equal(await scalar('select count(*)::int as value from public.trip_join_requests'),0);
  equal(await scalar('select public.atlas_save_trip_link($1,true) as value',[shared]),true);
  equal(await scalar('select public.atlas_request_trip_join($1) as value',[shared]),'pending');
  await blocked('select public.atlas_respond_trip_request($1,$2,true)',[shared,bob]);
  await blocked('select public.atlas_trip_requests($1)',[shared]);

  await actor('authenticated',alice);
  equal((await db.query('select display_name from public.atlas_trip_requests($1) order by display_name',[shared])).rows.map(row=>row.display_name),['Bob privado','Charlie privado']);
  await db.query('select public.atlas_respond_trip_request($1,$2,true)',[shared,bob]);
  await db.query('select public.atlas_respond_trip_request($1,$2,true)',[shared,bob]);
  equal((await db.query('select role,status,can_edit_itinerary,can_edit_description,can_add_photos,can_publish_profile from public.trip_members where trip_id=$1 and user_id=$2',[shared,bob])).rows,[{role:'viewer',status:'accepted',can_edit_itinerary:false,can_edit_description:false,can_add_photos:false,can_publish_profile:false}]);
  await db.query('select public.atlas_respond_trip_request($1,$2,false)',[shared,charlie]);
  equal(await scalar('select count(*)::int as value from public.atlas_trip_requests($1)',[shared]),0);

  await actor('authenticated',bob);
  const revision=await scalar('select revision as value from public.trips where id=$1',[shared]);
  await blocked('select public.atlas_save_trip($1,$2,$3,$4,null,true,$5::jsonb)',[shared,revision,'Edição não autorizada','',stops]);
  await blocked('select public.atlas_assign_trip_photo_stops($1,$2::jsonb)',[shared,JSON.stringify([{photo_id:bobPhoto,stop_id:'italy'}])]);
  equal(await scalar('select public.atlas_request_trip_join($1) as value',[shared]),'member');
  await actor('authenticated',alice);
  await db.query('select public.atlas_set_trip_permissions($1,$2,false,false,true,false)',[shared,bob]);
  await actor('authenticated',bob);
  await blocked('select public.atlas_assign_trip_photo_stops($1,$2::jsonb)',[shared,JSON.stringify([{photo_id:bobPhoto,stop_id:'italy'},{photo_id:alicePhoto,stop_id:'spain'}])]);
  equal(await scalar('select stop_id as value from public.trip_photos where id=$1',[bobPhoto]),null);
  await db.query('select public.atlas_assign_trip_photo_stops($1,$2::jsonb)',[shared,JSON.stringify([{photo_id:bobPhoto,stop_id:'italy'}])]);
  equal(await scalar('select stop_id as value from public.trip_photos where id=$1',[bobPhoto]),'italy');
  await blocked('select public.atlas_assign_trip_photo_stops($1,$2::jsonb)',[shared,JSON.stringify([{photo_id:privatePhoto,stop_id:'spain'}])]);
  await blocked('select public.atlas_assign_trip_photo_stops($1,$2::jsonb)',[shared,JSON.stringify([{photo_id:bobPhoto,stop_id:'missing-place'}])],['22023']);
  await blocked('select public.atlas_assign_trip_photo_stops($1,$2::jsonb)',[shared,JSON.stringify([{photo_id:bobPhoto,stop_id:12}])],['P0001']);

  await actor('authenticated',charlie);
  equal(await scalar('select public.atlas_request_trip_join($1) as value',[shared]),'rejected');
  equal(await scalar('select count(*)::int as value from public.trip_members where user_id=$1',[charlie]),0);
  equal(await scalar('select public.atlas_save_trip_link($1,false) as value',[shared]),false);
  equal(await scalar('select public.atlas_save_trip_link($1,true) as value',[shared]),true);

  await actor('authenticated',alice);
  await db.query('select public.atlas_assign_trip_photo_stops($1,$2::jsonb)',[shared,JSON.stringify([{photo_id:alicePhoto,stop_id:'spain'},{photo_id:bobPhoto,stop_id:'italy'}])]);
  equal(await scalar('select stop_id as value from public.trip_photos where id=$1',[alicePhoto]),'spain');
  await db.query('select public.atlas_save_trip($1,$2,$3,$4,null,false,$5::jsonb)',[shared,revision,'Trip compartilhada','',stops]);
  await actor('anon');equal(await scalar('select count(*)::int as value from public.trips where id=$1',[shared]),0);
  equal(await scalar('select count(*)::int as value from public.trip_photos where trip_id=$1',[shared]),0);
  await actor('authenticated',charlie);equal(await scalar('select count(*)::int as value from public.trips where id=$1',[shared]),0);
  await blocked('select public.atlas_request_trip_join($1)',[shared]);
  await actor('authenticated',bob);equal(await scalar('select count(*)::int as value from public.trips where id=$1',[shared]),1);
  await actor('authenticated',alice);equal(await scalar('select count(*)::int as value from public.destinations'),1);

  await actor('postgres');await db.exec(migration);
  equal(await scalar('select count(*)::int as value from public.trip_saves'),2);
  equal(await scalar('select status as value from public.trip_join_requests where trip_id=$1 and user_id=$2',[shared,bob]),'approved');
  await actor('authenticated',alice);
  const lastRevision=await scalar('select revision as value from public.trips where id=$1',[shared]);await db.query('select public.atlas_delete_trip($1,$2)',[shared,lastRevision]);
  await actor('postgres');
  for(const table of ['trip_saves','trip_join_requests','trip_members','trip_photos'])equal(await scalar(`select count(*)::int as value from public.${table} where trip_id=$1`,[shared]),0);
  equal(await scalar('select count(*)::int as value from public.trips'),1);
  equal(await scalar('select count(*)::int as value from public.destinations'),1);
  console.log(`${checks} verificações de PostgreSQL/RLS passaram; apenas dados de teste em memória foram usados.`);
} catch(error) { console.error({code:error.code || 'ASSERTION',message:error.message,position:error.position,where:error.where});process.exitCode=1; }
finally { await db.close(); }

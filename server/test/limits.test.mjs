import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { resumableUpload } from '../../src/resumable.js';
const alice='10000000-0000-4000-8000-000000000001',bob='10000000-0000-4000-8000-000000000002';
test('server quotas and private storage RLS resist client bypass',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;
   create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb not null default '{}');
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth,storage to anon,authenticated;
   create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb,primary key(bucket_id,name));
   create function storage.foldername(path text) returns text[] language sql immutable as $$select (string_to_array(path,'/'))[1:array_length(string_to_array(path,'/'),1)-1]$$;
   alter table storage.objects enable row level security;grant select,insert,update,delete on storage.objects to anon,authenticated;`);
  for(const file of ['schema.sql','trips.sql','collaboration.sql','media.sql','wishlist.sql','commercial-billing.sql','commercial-limits.sql'])await db.exec(await readFile(new URL(`../../supabase/${file}`,import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../../supabase/commercial-limits.sql',import.meta.url),'utf8'));
  await db.query('insert into auth.users(id) values($1),($2)',[alice,bob]);
  const actor=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
  const add=(name,size)=>db.query("insert into storage.objects(bucket_id,name,metadata) values('atlas-media',$1,jsonb_build_object('size',$2::bigint))",[name,size]);
  await actor(alice);await add(`${alice}/first.jpg`,1024);
  await assert.rejects(add(`${bob}/stolen.jpg`,100),e=>e.code==='42501');
  await assert.rejects(add(`${alice}/huge.jpg`,52428801),/ATLAS_FILE_LIMIT/);
  await db.exec('reset role');await db.query("update atlas_commercial.plan_limits set storage_bytes=2048,objects=2 where plan='free'");
  await actor(alice);await add(`${alice}/second.jpg`,1024);
  await assert.rejects(add(`${alice}/third.jpg`,1),/ATLAS_STORAGE_QUOTA/);
  await actor(bob);assert.equal((await db.query('select * from storage.objects')).rows.length,0);
  assert.equal((await db.query("delete from storage.objects where name=$1 returning *",[`${alice}/first.jpg`])).rows.length,0);
  assert.equal((await db.query("update storage.objects set name=$1 where name=$2 returning *",[`${bob}/x`,`${alice}/first.jpg`])).rows.length,0);
  await db.exec('reset role');
  await db.query("insert into atlas_commercial.subscriptions(subscription_id,user_id,status,paid_through) values('paid',$1,'active',2100000000)",[alice]);
  await actor(alice);await add(`${alice}/third.jpg`,4096); // paid limits are resolved inside DB, no client field
  await db.exec('reset role');await db.query("update atlas_commercial.subscriptions set blocked=true where user_id=$1",[alice]);
  await actor(alice);await assert.rejects(add(`${alice}/fourth.jpg`,1),/ATLAS_STORAGE_QUOTA/);
  // Existing objects remain; downgrade blocks growth, not backup or deletion.
  await db.query('delete from storage.objects where name=$1',[`${alice}/third.jpg`]);
  await db.exec('reset role');await db.query('insert into atlas_commercial.accounts(user_id,deletion_requested_at) values($1,now())',[alice]);
  await actor(alice);await assert.rejects(add(`${alice}/new.jpg`,1),/ATLAS_ACCOUNT_DELETING/);
 } finally {await db.close();}
});
test('TUS resumes exact offset after interrupted chunk and never leaks tokens to foreign URL',async()=>{
 const data=new Blob([new Uint8Array(7*1024*1024)],{type:'video/mp4'}),map=new Map();let offset=0,interrupted=false,patches=[];
 const cache={get:async k=>map.get(k),set:async(k,v)=>map.set(k,v),delete:async k=>map.delete(k)};
 const fetcher=async(url,options)=>{
  assert.equal(options.headers.Authorization,'Bearer fixture-only');
  if(options.method==='POST')return new Response(null,{status:201,headers:{Location:'https://storage.test/upload/u1'}});
  if(options.method==='HEAD')return new Response(null,{status:200,headers:{'Upload-Offset':String(offset)}});
  patches.push(Number(options.headers['Upload-Offset']));offset+=options.body.size;
  if(!interrupted){interrupted=true;throw new TypeError('network interrupted after commit');}
  return new Response(null,{status:204,headers:{'Upload-Offset':String(offset)}});
 };
 await resumableUpload({endpoint:'https://storage.test/upload',bucket:'atlas-media',path:`${alice}/movie.mp4`,blob:data,token:async()=>'fixture-only',cache,fetcher});
 assert.deepEqual(patches,[0,6*1024*1024]);assert.equal(offset,data.size);assert.equal(map.size,0);
  let foreignRequests=0;
 await assert.rejects(resumableUpload({endpoint:'https://storage.test/upload',bucket:'x',path:'x',blob:data,token:async()=>'secret',cache,
  fetcher:async(url)=>{if(new URL(url).hostname==='evil.test')foreignRequests++;return new Response(null,{status:201,headers:{Location:'https://evil.test/steal'}});}}),/Destino/);
 assert.equal(foreignRequests,0);
});

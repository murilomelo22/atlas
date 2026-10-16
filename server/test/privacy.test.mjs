import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {Repository} from '../src/repository.mjs';
import {createPrivacy,requireRecentLogin} from '../src/privacy.mjs';
const alice='10000000-0000-4000-8000-000000000001',bob='10000000-0000-4000-8000-000000000002';
test('fresh login is mandatory for deletion',()=>{
 assert.throws(()=>requireRecentLogin({last_sign_in_at:'invalid'}),/Entre novamente/);
 assert.throws(()=>requireRecentLogin({last_sign_in_at:new Date(0).toISOString()}),/Entre novamente/);
 assert.doesNotThrow(()=>requireRecentLogin({last_sign_in_at:new Date().toISOString()}));
});
test('account deletion resumes stages, cancels billing, deletes media and identity; RLS blocks stale JWTs',async()=>{
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
  for(const f of ['schema.sql','trips.sql','collaboration.sql','media.sql','wishlist.sql','migrations/20261013010702_atlas_trip_view_sharing.sql','commercial-billing.sql','commercial-limits.sql','commercial-privacy.sql'])await db.exec(await readFile(new URL(`../../supabase/${f}`,import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../../supabase/commercial-privacy.sql',import.meta.url),'utf8'));
  await db.query('insert into auth.users(id) values($1),($2)',[alice,bob]);
  const repo=new Repository({query:(...args)=>db.query(...args),connect:async()=>({query:(...args)=>db.query(...args),release(){}})});
  await repo.saveCustomer(alice,'cus_fixture');
  const calls=[];let fail=true;
  const admin={ban:async()=>calls.push('ban'),remove:async(bucket,paths)=>{if(fail){fail=false;throw new Error('provider down');}await db.query('delete from storage.objects where bucket_id=$1 and name=any($2)',[bucket,paths]);},deleteUser:async id=>{calls.push('delete');await db.query('delete from auth.users where id=$1',[id]);},signedURL:async()=> 'https://fixture.invalid/signed'};
  const stripe={subscriptions:{list:()=>({async *[Symbol.asyncIterator](){yield{id:'sub_test',status:'active'};}}),cancel:async()=>calls.push('cancel')}};
  const privacy=createPrivacy({db,repo,stripe,admin}),user={id:alice,last_sign_in_at:new Date().toISOString()};
  await db.query("insert into storage.objects(bucket_id,name,metadata) values('atlas-media',$1,'{\"size\":10}')",[`${alice}/a.jpg`]);
  const exported=await privacy.portability(user);assert.equal(exported.media.length,1);assert.equal(exported.records.profiles[0].id,alice);assert.equal(exported.mediaLinksExpireInSeconds,3600);
  await privacy.moderate({id:bob},{action:'block',targetType:'profile',targetId:alice,blockedId:alice});
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[bob]);await db.exec('set role authenticated');
  assert.equal((await db.query('select * from public.profiles where id=$1',[alice])).rows.length,0);await db.exec('reset role');
  await assert.rejects(privacy.requestDeletion(user,'wrong'),/Digite/);
  const result=await privacy.requestDeletion(user,'EXCLUIR MINHA CONTA');assert.equal(result.requested,true);
  assert.equal((await privacy.requestDeletion(user,'EXCLUIR MINHA CONTA')).deadline.getTime(),result.deadline.getTime());
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[alice]);await db.exec('set role authenticated');
  assert.equal((await db.query('select * from storage.objects')).rows.length,0);assert.equal((await db.query('select * from public.profiles where id=$1',[alice])).rows.length,0);
  await db.exec('reset role');
  const run=async()=>{await db.query('update atlas_commercial.deletion_jobs set next_attempt=now()');return privacy.workOnce();};
  await run();assert.ok(calls.includes('cancel'));await run(); // one forced Storage failure preserves job
  assert.equal((await db.query('select stage from atlas_commercial.deletion_jobs')).rows[0].stage,'media');
  await run();await run();await run();assert.ok(calls.includes('delete'));
  assert.equal((await db.query('select * from auth.users where id=$1',[alice])).rows.length,0);
  assert.equal((await db.query('select * from auth.users where id=$1',[bob])).rows.length,1);
  assert.equal((await db.query('select * from atlas_commercial.deletion_jobs')).rows.length,0);
 } finally {await db.close();}
});

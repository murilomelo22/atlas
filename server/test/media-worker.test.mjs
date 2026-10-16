import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {mediaWorker} from '../src/media-worker.mjs';
const alice='10000000-0000-4000-8000-000000000001';
test('media queue excludes derivatives, resumes expired lease and preserves source on failure',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create schema storage;create table storage.objects(bucket_id text,name text,metadata jsonb);');
  for(const file of ['commercial-billing.sql','commercial-media.sql'])await db.exec(await readFile(new URL(`../../supabase/${file}`,import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../../supabase/commercial-media.sql',import.meta.url),'utf8'));
  await db.query('insert into auth.users values($1)',[alice]);
  const add=path=>db.query("insert into storage.objects values('atlas-media',$1,'{\"mimetype\":\"video/mp4\",\"size\":10}')",[path]);
  await add(`${alice}/video.mp4`);await add(`${alice}/_derived/other.mp4`);
  assert.equal((await db.query('select * from atlas_commercial.media_jobs')).rows.length,1);
  const uploaded=new Map();let failed=false,conversions=0;
  const once=mediaWorker({db,storage:{download:async()=>Buffer.alloc(10),upload:async(bucket,path,bytes)=>{if(failed)throw new Error('provider down');uploaded.set(`${bucket}/${path}`,bytes);}},transcode:async(input,output,thumb)=>{conversions++;await writeFile(output,Buffer.alloc(4));await writeFile(thumb,Buffer.alloc(2));return {useCompressed:true};}});
  await db.query("update atlas_commercial.media_jobs set status='processing',locked_until=now()-interval '1 minute'");
  assert.equal(await once(),true);assert.equal((await db.query('select status from atlas_commercial.media_jobs')).rows[0].status,'ready');assert.equal(uploaded.size,2);assert.equal(await once(),false);
  await add(`${alice}/fails.mp4`);failed=true;await once();await once();await once();
  assert.equal((await db.query("select status from atlas_commercial.media_jobs where path like '%fails.mp4'")).rows[0].status,'failed');
  assert.equal((await db.query('select * from storage.objects')).rows.length,3);
  await add(`${alice}/deleting.mp4`);await db.query('insert into atlas_commercial.accounts(user_id,deletion_requested_at) values($1,now())',[alice]);
  const before=conversions;await once();assert.equal(conversions,before);
 }finally{await db.close();}
});

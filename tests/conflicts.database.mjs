import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Execute real PostgreSQL revision checks and RLS with synthetic users in memory.
const db = new PGlite();
const alice = '10000000-0000-4000-8000-000000000001';
const bob = '10000000-0000-4000-8000-000000000002';
const trip = '50000000-0000-4000-8000-000000000001';
const stale = '70000000-0000-4000-8000-000000000001';
let checks = 0;
async function actor(role, id = '') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec(`set role ${role}`);
}
async function scalar(sql, args = []) { return (await db.query(sql, args)).rows[0].value; }
async function blocked(sql, args = [], code = 'PT409') {
  await assert.rejects(db.query(sql, args), error => error.code === code); checks++;
}
function equal(actual, expected) { assert.deepEqual(actual, expected); checks++; }
const functions = `select oid::regprocedure::text as signature,prosecdef,proconfig,proacl
  from pg_proc where pronamespace='public'::regnamespace
  and proname in ('save_destination','delete_destination','atlas_save_trip','atlas_delete_trip','atlas_save_wishlist') order by oid`;
try {
  await db.exec(`create role anon; create role authenticated; create schema auth; create schema storage;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb not null default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to anon,authenticated;
    create table storage.buckets(id text primary key,name text,public boolean default false,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,primary key(bucket_id,name));
    create function storage.foldername(path text) returns text[] language sql immutable as $$select (string_to_array(path,'/'))[1:array_length(string_to_array(path,'/'),1)-1]$$;
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon,authenticated; grant select,insert,update,delete on storage.objects to anon,authenticated;`);
  // Start from the previous installation so the migration itself is exercised.
  for (const name of ['schema', 'trips', 'collaboration', 'media', 'wishlist']) {
    const sql = await readFile(new URL(`../supabase/${name}.sql`, import.meta.url), 'utf8');
    await db.exec(sql.replaceAll("'PT409'", "'40001'"));
  }
  for (const [id, name] of [[alice, 'Alice'], [bob, 'Bob']]) {
    await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3::jsonb)', [id, `${name}@test.invalid`, JSON.stringify({ display_name: name })]);
  }
  const save = 'select public.save_destination($1,$2::jsonb,\'private\',$3,\'[]\'::jsonb) as value';
  const destination = JSON.stringify({ name: 'Paris', lat: 48.85, lng: 2.35, visits: [], tags: [], photoIds: [], notes: '', rating: 5 });
  await actor('authenticated', alice);
  const original = await scalar(save, ['paris', destination, null]);
  await blocked(save, ['paris', destination, stale], '40001');
  await actor('postgres');
  const before = (await db.query(functions)).rows;
  const files = await readdir(new URL('../supabase/migrations/', import.meta.url));
  const migration = await readFile(new URL(`../supabase/migrations/${files.find(file => file.endsWith('_atlas_conflict_http409.sql'))}`, import.meta.url), 'utf8');
  await db.exec(migration); await db.exec(migration);
  equal((await db.query(functions)).rows, before);
  equal(await scalar("select count(*)::int as value from pg_proc where pronamespace='public'::regnamespace and prosrc like '%''40001''%'"), 0);

  await actor('authenticated', alice);
  const changed = JSON.stringify({ ...JSON.parse(destination), notes: 'Primeira edição' });
  const latest = await scalar(save, ['paris', changed, original]);
  await blocked(save, ['paris', destination, original]);
  await blocked('select public.delete_destination($1,$2)', ['paris', original]);
  equal(await scalar("select data->>'notes' as value from public.destinations where id='paris'"), 'Primeira edição');
  await db.query('select public.delete_destination($1,$2)', ['paris', latest]);
  equal(await scalar('select count(*)::int as value from public.destinations'), 0);

  const saveWish = 'select public.atlas_save_wishlist($1::jsonb,false,$2) as value';
  const firstWish = await scalar(saveWish, ['[]', null]);
  const items = JSON.stringify([{ id: stale, name: 'Kyoto', country: 'Japão', notes: '' }]);
  const nextWish = await scalar(saveWish, [items, firstWish]);
  equal(await scalar(saveWish, [items, firstWish]), nextWish); // Safe replay after a lost response.
  await blocked(saveWish, ['[]', firstWish]);
  equal(await scalar('select items as value from public.wishlists'), JSON.parse(items));

  const saveTrip = 'select public.atlas_save_trip($1,$2,$3,\'\',null,false,\'[]\'::jsonb) as value';
  const firstTrip = await scalar(saveTrip, [trip, null, 'Roteiro']);
  const nextTrip = await scalar(saveTrip, [trip, firstTrip.revision, 'Novo roteiro']);
  await blocked(saveTrip, [trip, firstTrip.revision, 'Edição atrasada']);
  await blocked('select public.atlas_delete_trip($1,$2)', [trip, firstTrip.revision]);
  equal(await scalar('select name as value from public.trips where id=$1', [trip]), 'Novo roteiro');
  await scalar(save, ['private', destination, null]);

  await actor('authenticated', bob);
  for (const table of ['destinations', 'wishlists', 'trips']) equal(await scalar(`select count(*)::int as value from public.${table}`), 0);
  await blocked(saveTrip, [trip, nextTrip.revision, 'Sem permissão'], '42501');
  await blocked('select public.atlas_delete_trip($1,$2)', [trip, nextTrip.revision], '42501');
  await actor('anon');
  await blocked(save, ['private', destination, null], '42501');
  await blocked(saveWish, ['[]', null], '42501');
  await actor('authenticated', alice);
  await db.query('select public.atlas_delete_trip($1,$2)', [trip, nextTrip.revision]);
  equal(await scalar('select count(*)::int as value from public.trips'), 0);
  console.log(`${checks} verificações passaram: migração de 40001 para PT409, revisões, gravação/exclusão, replay e permissões.`);
} finally { await db.close(); }

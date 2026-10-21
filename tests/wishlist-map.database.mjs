import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const db = new PGlite(), alice = '10000000-0000-4000-8000-000000000001', bob = '10000000-0000-4000-8000-000000000002';
const legacy = { id: alice, name: 'Kyoto', country: 'Japão', notes: 'Templos' };
const mapped = { ...legacy, location: { lat: 35.0116, lng: 135.7681 }, status: 'planning' };
let checks = 0;
const equal = (a, b) => { assert.deepEqual(a, b); checks++; };
const scalar = async (sql, args = []) => (await db.query(sql, args)).rows[0].value;
const saveSQL = 'select public.atlas_save_wishlist($1::jsonb,$2,$3) as value';
const save = (items, revision, isPublic = false) => scalar(saveSQL, [JSON.stringify(items), isPublic, revision]);
async function actor(role, id = '') {
  await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]); await db.exec(`set role ${role}`);
}
async function blocked(sql, args, code) { await assert.rejects(db.query(sql, args), error => error.code === code); checks++; }
try {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to anon,authenticated;
    create table public.profiles(id uuid primary key,is_public boolean not null default false);
    grant select on public.profiles to anon,authenticated;`);
  await db.exec(await readFile(new URL('../supabase/wishlist.sql', import.meta.url), 'utf8'));
  await db.query('insert into public.profiles(id,is_public) values($1,true),($2,true)', [alice, bob]);
  await actor('authenticated', alice);
  const first = await save([legacy], null);
  await actor('postgres');
  const policies = (await db.query("select * from pg_policies where tablename='wishlists'")).rows;
  const privileges = (await db.query("select relacl,relrowsecurity from pg_class where oid='public.wishlists'::regclass")).rows;
  const functionPrivileges = (await db.query("select proname,proacl,prosecdef,proconfig from pg_proc where pronamespace='public'::regnamespace and proname in ('atlas_valid_wishlist','atlas_save_wishlist') order by proname")).rows;
  const migration = await readFile(new URL('../supabase/migrations/20261021191932_atlas_wishlist_map.sql', import.meta.url), 'utf8');
  await db.exec(migration); await db.exec(migration);
  equal((await db.query("select * from pg_policies where tablename='wishlists'")).rows, policies);
  equal((await db.query("select relacl,relrowsecurity from pg_class where oid='public.wishlists'::regclass")).rows, privileges);
  equal((await db.query("select proname,proacl,prosecdef,proconfig from pg_proc where pronamespace='public'::regnamespace and proname in ('atlas_valid_wishlist','atlas_save_wishlist') order by proname")).rows, functionPrivileges);
  equal(await scalar('select items as value from public.wishlists'), [legacy]);
  const validate = items => scalar('select public.atlas_valid_wishlist($1::jsonb) as value', [JSON.stringify(items)]);
  for (const valid of [[legacy], [mapped], [{ ...mapped, status: 'visited' }], [{ ...mapped, location: { lat: 0, lng: 0 } }]]) equal(await validate(valid), true);
  for (const item of [
    { ...mapped, status: 'unknown' }, { ...mapped, status: null }, { ...mapped, status: ['planning'] },
    { ...mapped, location: null }, { ...mapped, location: { lat: '35', lng: 135 } },
    { ...mapped, location: { lat: 91, lng: 0 } }, { ...mapped, location: { lat: 0, lng: -181 } },
    { ...mapped, location: { lat: 0 } }, { ...mapped, location: { lat: 0, lng: 0, extra: 1 } },
    { ...mapped, extra: 'rejected' }, { ...mapped, name: '' }, { ...mapped, notes: 'x'.repeat(2001) },
  ]) equal(await validate([item]), false);
  equal(await validate([mapped, mapped]), false);
  await actor('authenticated', alice);
  const revision = await save([mapped], first);
  equal(await scalar('select items as value from public.wishlists'), [mapped]);
  equal(await save([mapped], first), revision); // Lost responses can be retried.
  await blocked(saveSQL, [JSON.stringify([legacy]), false, first], 'PT409');
  await blocked(saveSQL, [JSON.stringify([{ ...mapped, status: 'unknown' }]), false, revision], '22023');
  await blocked('update public.wishlists set is_public=true', [], '42501');
  await actor('authenticated', bob); equal(await scalar('select count(*)::int as value from public.wishlists'), 0);
  await actor('anon'); equal(await scalar('select count(*)::int as value from public.wishlists'), 0);
  await blocked(saveSQL, ['[]', false, null], '42501');
  await actor('authenticated', alice); await save([{ ...mapped, status: 'visited' }], revision, true);
  await actor('anon'); equal((await scalar('select items as value from public.wishlists'))[0].status, 'visited');
  await actor('postgres'); await db.query('update public.profiles set is_public=false where id=$1', [alice]);
  await actor('anon'); equal(await scalar('select count(*)::int as value from public.wishlists'), 0);
  console.log(`${checks} verificações passaram: compatibilidade, mapa, validação, revisões, replay e privacidade.`);
} finally { await db.close(); }

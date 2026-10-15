import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const db = new PGlite(), alice = '10000000-0000-4000-8000-000000000001', bob = '10000000-0000-4000-8000-000000000002';
async function actor(role, id = '') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  await db.exec(`set role ${role}`);
}
try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; grant usage on schema auth to authenticated;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table public.profiles(id uuid primary key);`);
  const sql = await readFile(new URL('../supabase/premium.sql', import.meta.url), 'utf8');
  await db.exec(sql); await db.exec(sql);
  await db.query('insert into public.profiles values ($1),($2)', [alice, bob]);
  await db.query('insert into public.premium_accounts(user_id) values ($1)', [alice]);
  await actor('anon');
  await assert.rejects(db.query('select * from public.premium_accounts'), e => e.code === '42501');
  await actor('authenticated', bob);
  assert.equal((await db.query('select * from public.premium_accounts')).rows.length, 0);
  await assert.rejects(db.query('insert into public.premium_accounts(user_id) values ($1)', [bob]), e => e.code === '42501');
  await assert.rejects(db.query('update public.premium_accounts set user_id = $1', [bob]), e => e.code === '42501');
  await assert.rejects(db.query('delete from public.premium_accounts'), e => e.code === '42501');
  await actor('authenticated', alice);
  assert.equal((await db.query('select user_id from public.premium_accounts')).rows[0].user_id, alice);
  await actor('postgres');
  await db.query("update public.premium_accounts set granted_at = now() - interval '2 days', expires_at = now() - interval '1 day' where user_id = $1", [alice]);
  await actor('authenticated', alice);
  assert.equal((await db.query('select * from public.premium_accounts')).rows.length, 0);
  await actor('postgres');
  await db.query('delete from public.premium_accounts where user_id = $1', [alice]);
  await actor('authenticated', alice);
  assert.equal((await db.query('select * from public.premium_accounts')).rows.length, 0);
  console.log('Premium: PostgreSQL/RLS validou leitura própria, bloqueio de autoativação, isolamento, expiração, revogação e reinstalação.');
} finally { await db.close(); }

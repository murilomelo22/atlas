-- Optional test premium entitlement, after schema.sql. No billing integration.
begin;
create table if not exists public.premium_accounts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  source text not null default 'test' check (source in ('test', 'manual')),
  check (expires_at is null or expires_at > granted_at)
);
alter table public.premium_accounts enable row level security;
revoke all on public.premium_accounts from public, anon, authenticated;
grant select on public.premium_accounts to authenticated;
grant all on public.premium_accounts to service_role;
drop policy if exists premium_read_own on public.premium_accounts;
create policy premium_read_own on public.premium_accounts for select to authenticated
  using ((select auth.uid()) = user_id and (expires_at is null or expires_at > now()));
comment on table public.premium_accounts is 'Admin-managed premium access. Test phase; no billing. Clients can only read their own active grant.';
commit;

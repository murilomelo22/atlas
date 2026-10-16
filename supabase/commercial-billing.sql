-- Additive, repeatable. Apply after schema.sql with an administrator, staging first.
begin;
create schema if not exists atlas_commercial;
revoke all on schema atlas_commercial from public,anon,authenticated;
create table if not exists atlas_commercial.accounts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 customer_id text unique,
 deletion_requested_at timestamptz
);
create table if not exists atlas_commercial.subscriptions (
 subscription_id text primary key, user_id uuid not null references auth.users(id) on delete cascade,
 status text not null, paid_through bigint not null default 0, grace_until bigint not null default 0,
 invoice_id text, blocked boolean not null default false, cancel_at_period_end boolean not null default false
);
create index if not exists commercial_subscription_user on atlas_commercial.subscriptions(user_id);
create table if not exists atlas_commercial.events (
 event_id text primary key, type text not null, processed_at timestamptz not null default now()
);
create table if not exists atlas_commercial.revocations (
 user_id uuid not null references auth.users(id) on delete cascade, invoice_id text not null,
 primary key(user_id,invoice_id)
);
alter table atlas_commercial.accounts enable row level security;
alter table atlas_commercial.subscriptions enable row level security;
alter table atlas_commercial.events enable row level security;
alter table atlas_commercial.revocations enable row level security;
revoke all on all tables in schema atlas_commercial from public,anon,authenticated;
comment on schema atlas_commercial is 'Private backend-only billing ledger. Never expose through PostgREST. No client policies.';
commit;

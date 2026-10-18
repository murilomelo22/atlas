begin;
-- New accounts start private; preserve existing users' current visibility settings.
alter table public.profiles alter column is_public set default false;
create table if not exists atlas_commercial.deletion_jobs (
 user_id uuid primary key references auth.users(id) on delete cascade,
 requested_at timestamptz not null default now(), deadline timestamptz not null default now()+interval '7 days',
 stage text not null default 'billing' check(stage in ('billing','media','identity')),
 attempts integer not null default 0, next_attempt timestamptz not null default now(), locked_until timestamptz
);
create table if not exists atlas_commercial.consents (
 user_id uuid not null references auth.users(id) on delete cascade, document_version text not null,
 accepted_at timestamptz not null default now(), primary key(user_id,document_version)
);
create table if not exists atlas_commercial.blocks (
 blocker uuid not null references auth.users(id) on delete cascade, blocked uuid not null references auth.users(id) on delete cascade,
 primary key(blocker,blocked),check(blocker<>blocked)
);
create table if not exists atlas_commercial.reports (
 id uuid primary key default gen_random_uuid(), reporter uuid references auth.users(id) on delete set null,
 target_type text not null check(target_type in ('profile','destination','trip')),target_id text not null check(length(target_id) between 1 and 128),
 reason text not null check(reason in ('privacy','harassment','illegal','other')), created_at timestamptz not null default now(),
 status text not null default 'pending' check(status in ('pending','reviewed','actioned','dismissed'))
);
alter table atlas_commercial.deletion_jobs enable row level security;
alter table atlas_commercial.consents enable row level security;
alter table atlas_commercial.blocks enable row level security;
alter table atlas_commercial.reports enable row level security;
revoke all on atlas_commercial.deletion_jobs,atlas_commercial.consents,atlas_commercial.blocks,atlas_commercial.reports from public,anon,authenticated;
create or replace function public.atlas_owner_available(owner uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users where id=owner)
 and not exists(select 1 from atlas_commercial.accounts where user_id=owner and deletion_requested_at is not null)
 and not exists(select 1 from atlas_commercial.blocks where blocker=auth.uid() and blocked=owner)
$$;
revoke all on function public.atlas_owner_available(uuid) from public;
grant execute on function public.atlas_owner_available(uuid) to anon,authenticated;
-- Restrictive policies compose with existing opt-in public/shared access policies.
drop policy if exists commercial_available on public.profiles;
create policy commercial_available on public.profiles as restrictive for all to anon,authenticated using(public.atlas_owner_available(id)) with check(public.atlas_owner_available(id));
do $$declare tbl text;begin
 foreach tbl in array array['destinations','photos','wishlists','trips'] loop
  execute format('drop policy if exists commercial_available on public.%I',tbl);
  execute format('create policy commercial_available on public.%I as restrictive for all to anon,authenticated using(public.atlas_owner_available(owner_id)) with check(public.atlas_owner_available(owner_id))',tbl);
 end loop;
end$$;
drop policy if exists commercial_available on storage.objects;
create policy commercial_available on storage.objects as restrictive for all to anon,authenticated
 using(bucket_id not in ('atlas-media','atlas-trip-media','atlas-avatars') or public.atlas_owner_available(split_part(name,'/',1)::uuid))
 with check(bucket_id not in ('atlas-media','atlas-trip-media','atlas-avatars') or public.atlas_owner_available(split_part(name,'/',1)::uuid));
commit;

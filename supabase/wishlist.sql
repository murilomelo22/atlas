-- Execute after schema.sql. Additive, repeatable, independent of trips/media.
begin;
create or replace function public.atlas_valid_wishlist(p_items jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare item jsonb; seen text[] := array[]::text[];
begin
 if p_items is null or jsonb_typeof(p_items)<>'array' then return false;end if;
 if jsonb_array_length(p_items)>200 then return false;end if;
 for item in select value from jsonb_array_elements(p_items) loop
  if jsonb_typeof(item)<>'object' then return false;end if;
  if (select count(*) from jsonb_object_keys(item))<>4 then return false;end if;
  if (jsonb_typeof(item)='object'
   and jsonb_typeof(item->'id')='string' and (item->>'id') ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
   and jsonb_typeof(item->'name')='string' and length(trim(item->>'name')) between 1 and 120 and length(item->>'name')<=120
   and jsonb_typeof(item->'country')='string' and length(item->>'country')<=80
   and jsonb_typeof(item->'notes')='string' and length(item->>'notes')<=2000) is not true then return false;end if;
  if item->>'id'=any(seen) then return false;end if;
  seen := array_append(seen,item->>'id');
 end loop;
 return true;
end;
$$;
revoke all on function public.atlas_valid_wishlist(jsonb) from public,anon,authenticated;
create table if not exists public.wishlists (
 owner_id uuid primary key references public.profiles(id) on delete cascade,
 items jsonb not null default '[]'::jsonb check(public.atlas_valid_wishlist(items)),
 is_public boolean not null default false,
 revision uuid not null default gen_random_uuid(),
 updated_at timestamptz not null default now()
);
alter table public.wishlists enable row level security;
revoke all on public.wishlists from public,anon,authenticated;
grant select on public.wishlists to anon,authenticated;
drop policy if exists atlas_wishlist_read on public.wishlists;
create policy atlas_wishlist_read on public.wishlists for select to anon,authenticated using (
 owner_id=(select auth.uid()) or (is_public and exists(select 1 from public.profiles p where p.id=owner_id and p.is_public))
);
-- Writes go through this RPC: caller identity is never supplied by the browser.
create or replace function public.atlas_save_wishlist(p_items jsonb,p_public boolean,p_expected_revision uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare owner uuid := auth.uid(); previous public.wishlists; next_revision uuid := gen_random_uuid();
begin
 if owner is null then raise exception 'Authentication required' using errcode='42501';end if;
 if p_public is null or not public.atlas_valid_wishlist(p_items) then raise exception 'Invalid wishlist' using errcode='22023';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('wishlist:'||owner::text,0));
 select * into previous from public.wishlists where owner_id=owner for update;
 if previous.revision is distinct from p_expected_revision then
  -- A lost response can be retried safely, without adding duplicate items.
  if previous.revision is not null and previous.items=p_items and previous.is_public=p_public then return previous.revision;end if;
  raise exception 'ATLAS_WISHLIST_CONFLICT' using errcode='40001';
 end if;
 insert into public.wishlists(owner_id,items,is_public,revision)
 values(owner,p_items,p_public,next_revision)
 on conflict(owner_id) do update set items=excluded.items,is_public=excluded.is_public,revision=excluded.revision,updated_at=now();
 return next_revision;
end;
$$;
revoke all on function public.atlas_save_wishlist(jsonb,boolean,uuid) from public,anon,authenticated;
grant execute on function public.atlas_save_wishlist(jsonb,boolean,uuid) to authenticated;
notify pgrst,'reload schema';
commit;

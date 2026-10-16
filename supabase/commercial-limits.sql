-- Staging first. Requires commercial-billing.sql and existing schema/media/trips SQL.
begin;
create table if not exists atlas_commercial.plan_limits (
 plan text primary key check(plan in ('free','paid')), storage_bytes bigint not null check(storage_bytes>0),
 objects bigint not null check(objects>0), object_bytes bigint not null check(object_bytes>0),
 destinations bigint not null check(destinations>0), monthly_write_bytes bigint not null check(monthly_write_bytes>0)
);
insert into atlas_commercial.plan_limits values
 ('free',268435456,500,52428800,200,104857600),
 ('paid',10737418240,20000,52428800,10000,1073741824) on conflict do nothing;
create table if not exists atlas_commercial.write_usage (
 user_id uuid not null references auth.users(id) on delete cascade, month date not null,
 bytes bigint not null default 0, requests bigint not null default 0, primary key(user_id,month)
);
alter table atlas_commercial.plan_limits enable row level security;
alter table atlas_commercial.write_usage enable row level security;
revoke all on atlas_commercial.plan_limits,atlas_commercial.write_usage from public,anon,authenticated;
create or replace function atlas_commercial.limits_for(owner uuid)
returns atlas_commercial.plan_limits language sql stable set search_path='' as $$
 select l.* from atlas_commercial.plan_limits l where l.plan=case when exists (
  select 1 from atlas_commercial.subscriptions s where s.user_id=owner and not s.blocked
  and s.status in ('active','past_due') and greatest(s.paid_through,case when s.status='past_due' then s.grace_until else 0 end)>extract(epoch from now())
 ) then 'paid' else 'free' end
$$;
revoke all on function atlas_commercial.limits_for(uuid) from public,anon,authenticated;
create or replace function atlas_commercial.check_storage()
returns trigger language plpgsql security definer set search_path='' as $$
declare owner uuid; lim atlas_commercial.plan_limits; used bigint; count_objects bigint; new_size bigint;
begin
 if new.bucket_id not in ('atlas-media','atlas-trip-media','atlas-avatars') then return new;end if;
 begin owner:=split_part(new.name,'/',1)::uuid;new_size:=(new.metadata->>'size')::bigint;
 exception when others then raise exception 'ATLAS_INVALID_MEDIA' using errcode='22023';end;
 if new_size is null or new_size<1 then raise exception 'ATLAS_INVALID_MEDIA' using errcode='22023';end if;
 if tg_op='UPDATE' and (old.name<>new.name or old.bucket_id<>new.bucket_id) then raise exception 'ATLAS_MEDIA_IMMUTABLE' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('commercial:'||owner::text,0));
 if exists(select 1 from atlas_commercial.accounts where user_id=owner and deletion_requested_at is not null) then raise exception 'ATLAS_ACCOUNT_DELETING' using errcode='42501';end if;
 select * into lim from atlas_commercial.limits_for(owner);
 if lim.plan is null then raise exception 'ATLAS_LIMITS_UNAVAILABLE';end if;
 select coalesce(sum((metadata->>'size')::bigint),0),count(*) into used,count_objects from storage.objects
 where bucket_id in ('atlas-media','atlas-trip-media','atlas-avatars') and split_part(name,'/',1)=owner::text;
 if tg_op='UPDATE' then used:=used-coalesce((old.metadata->>'size')::bigint,0);count_objects:=count_objects-1;end if;
 if new_size>lim.object_bytes or new.bucket_id='atlas-avatars' and new_size>1048576 then raise exception 'ATLAS_FILE_LIMIT' using errcode='P0001';end if;
 if used+new_size>lim.storage_bytes then raise exception 'ATLAS_STORAGE_QUOTA' using errcode='P0001';end if;
 if count_objects+1>lim.objects then raise exception 'ATLAS_MEDIA_QUOTA' using errcode='P0001';end if;
 return new;
end;
$$;
revoke all on function atlas_commercial.check_storage() from public,anon,authenticated;
drop trigger if exists atlas_commercial_storage_limits on storage.objects;
create trigger atlas_commercial_storage_limits before insert or update on storage.objects for each row execute function atlas_commercial.check_storage();
create or replace function atlas_commercial.check_write()
returns trigger language plpgsql security definer set search_path='' as $$
declare owner uuid:=new.owner_id; lim atlas_commercial.plan_limits; usage atlas_commercial.write_usage;
 size bigint:=pg_catalog.pg_column_size(to_jsonb(new));
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('commercial:'||owner::text,0));
 if exists(select 1 from atlas_commercial.accounts where user_id=owner and deletion_requested_at is not null) then raise exception 'ATLAS_ACCOUNT_DELETING' using errcode='42501';end if;
 select * into lim from atlas_commercial.limits_for(owner);
 if tg_table_name='destinations' and tg_op='INSERT' and (select count(*) from public.destinations where owner_id=owner)>=lim.destinations then raise exception 'ATLAS_DESTINATION_QUOTA';end if;
 insert into atlas_commercial.write_usage(user_id,month,bytes,requests) values(owner,date_trunc('month',now())::date,size,1)
 on conflict(user_id,month) do update set bytes=atlas_commercial.write_usage.bytes+excluded.bytes,requests=atlas_commercial.write_usage.requests+1 returning * into usage;
 if usage.bytes>lim.monthly_write_bytes or usage.requests>100000 then raise exception 'ATLAS_SYNC_QUOTA';end if;
 return new;
end;
$$;
revoke all on function atlas_commercial.check_write() from public,anon,authenticated;
drop trigger if exists atlas_commercial_destination_limits on public.destinations;
create trigger atlas_commercial_destination_limits before insert or update on public.destinations for each row execute function atlas_commercial.check_write();
drop trigger if exists atlas_commercial_wishlist_limits on public.wishlists;
create trigger atlas_commercial_wishlist_limits before insert or update on public.wishlists for each row execute function atlas_commercial.check_write();
drop trigger if exists atlas_commercial_trip_limits on public.trips;
create trigger atlas_commercial_trip_limits before insert or update on public.trips for each row execute function atlas_commercial.check_write();
commit;

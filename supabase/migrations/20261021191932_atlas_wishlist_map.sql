-- After wishlist.sql. Add optional map coordinates and progress without rewriting
-- existing lists, changing their visibility, or widening any role's permissions.
begin;
create or replace function public.atlas_valid_wishlist(p_items jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare item jsonb; seen text[] := array[]::text[];
begin
 if p_items is null or jsonb_typeof(p_items)<>'array' then return false; end if;
 if jsonb_array_length(p_items)>200 then return false; end if;
 for item in select value from jsonb_array_elements(p_items) loop
  if jsonb_typeof(item)<>'object' then return false; end if;
  if not (item ?& array['id','name','country','notes']) or exists (
   select 1 from jsonb_object_keys(item) as k(key)
   where key <> all(array['id','name','country','notes','location','status'])
  ) then return false; end if;
  if (jsonb_typeof(item->'id')='string' and (item->>'id') ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
   and jsonb_typeof(item->'name')='string' and length(trim(item->>'name')) between 1 and 120 and length(item->>'name')<=120
   and jsonb_typeof(item->'country')='string' and length(item->>'country')<=80
   and jsonb_typeof(item->'notes')='string' and length(item->>'notes')<=2000) is not true then return false; end if;
  if item ? 'status' then
   if (jsonb_typeof(item->'status')='string' and item->>'status' in ('wishlist','planning','visited')) is not true then return false; end if;
  end if;
  if item ? 'location' then
   if jsonb_typeof(item->'location') is distinct from 'object' then return false; end if;
   if (select count(*) from jsonb_object_keys(item->'location'))<>2
    or jsonb_typeof(item->'location'->'lat') is distinct from 'number'
    or jsonb_typeof(item->'location'->'lng') is distinct from 'number' then return false; end if;
   if (item->'location'->>'lat')::numeric not between -90 and 90
    or (item->'location'->>'lng')::numeric not between -180 and 180 then return false; end if;
  end if;
  if item->>'id'=any(seen) then return false; end if;
  seen := array_append(seen,item->>'id');
 end loop;
 return true;
end;
$$;
-- Keep this validator internal. Writes still use the existing authenticated RPC,
-- owner check, advisory lock, revision check and private/public RLS policies.
revoke all on function public.atlas_valid_wishlist(jsonb) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;

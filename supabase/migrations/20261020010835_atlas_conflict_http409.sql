-- Application revision conflicts must not use PostgreSQL's serialization_failure
-- (40001): PostgREST 14 can retry that error indefinitely. PT409 returns HTTP 409.
-- Reuse installed definitions to preserve optional media/collaboration upgrades,
-- argument defaults, SECURITY modes, search_path, ownership and existing grants.
do $fix$
declare signature text; target regprocedure; definition text;
begin
  foreach signature in array array[
    'public.save_destination(text,jsonb,text,uuid,jsonb)',
    'public.delete_destination(text,uuid)',
    'public.atlas_save_trip(uuid,uuid,text,text,text,boolean,jsonb)',
    'public.atlas_delete_trip(uuid,uuid)',
    'public.atlas_save_wishlist(jsonb,boolean,uuid)'
  ] loop
    target := to_regprocedure(signature);
    if target is null then continue; end if;
    definition := pg_get_functiondef(target);
    if position('''40001''' in definition) > 0 then
      execute replace(definition, '''40001''', '''PT409''');
    end if;
  end loop;
end;
$fix$;
notify pgrst, 'reload schema';

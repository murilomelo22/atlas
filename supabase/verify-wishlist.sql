-- Run after wishlist.sql. Random fixtures are undone by ROLLBACK. No Storage operations.
begin;
select set_config('atlas.wish.owner',gen_random_uuid()::text,true),set_config('atlas.wish.other',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data)
select current_setting('atlas.wish.'||person)::uuid,'wishlist-'||current_setting('atlas.wish.'||person)||'@example.invalid','{}'::jsonb from unnest(array['owner','other']) as people(person);
update public.profiles set is_public=true where id in (current_setting('atlas.wish.owner')::uuid,current_setting('atlas.wish.other')::uuid);
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('atlas.wish.owner'),true),set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('atlas.wish.owner'),'role','authenticated')::text,true);
select public.atlas_save_wishlist('[{"id":"50000000-0000-4000-8000-000000000001","name":"Kyoto","country":"Japão","notes":"Templos"}]',false,null);
do $$ declare w public.wishlists; next_revision uuid; begin
 select * into w from public.wishlists where owner_id=auth.uid();
 if w.is_public then raise exception 'FAIL private save';end if;
 next_revision:=public.atlas_save_wishlist(w.items,w.is_public,null);
 if next_revision<>w.revision then raise exception 'FAIL retry';end if;
 begin perform public.atlas_save_wishlist('[]',false,null);raise exception 'FAIL stale write';exception when serialization_failure then null;end;
 begin perform public.atlas_save_wishlist('[{"id":"invalid","name":"Kyoto","country":"Japão","notes":""}]',true,w.revision);raise exception 'FAIL malformed item';exception when invalid_parameter_value then null;end;
 begin perform public.atlas_save_wishlist(w.items||w.items,true,w.revision);raise exception 'FAIL duplicate ids';exception when invalid_parameter_value then null;end;
 begin perform public.atlas_save_wishlist((select jsonb_agg(jsonb_build_object('id',gen_random_uuid()::text,'name','Lugar','country','','notes','')) from generate_series(1,201)),true,w.revision);raise exception 'FAIL item limit';exception when invalid_parameter_value then null;end;
 begin update public.wishlists set is_public=true where owner_id=auth.uid();raise exception 'FAIL direct write';exception when insufficient_privilege then null;end;
 if (select revision from public.wishlists where owner_id=auth.uid())<>w.revision then raise exception 'FAIL failed write changed revision';end if;
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true);
do $$ begin
 if exists(select 1 from public.wishlists where owner_id=current_setting('atlas.wish.owner')::uuid) then raise exception 'FAIL anonymous private read';end if;
 begin perform public.atlas_save_wishlist('[]',true,null);raise exception 'FAIL anonymous write';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('atlas.wish.other'),true),set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('atlas.wish.other'),'role','authenticated')::text,true);
do $$ begin
 if exists(select 1 from public.wishlists where owner_id=current_setting('atlas.wish.owner')::uuid) then raise exception 'FAIL other account private read';end if;
 perform public.atlas_save_wishlist('[]',false,null);
 begin delete from public.wishlists where owner_id=current_setting('atlas.wish.owner')::uuid;raise exception 'FAIL other account delete';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from public.wishlists where owner_id=current_setting('atlas.wish.owner')::uuid and items->0->>'name'='Kyoto') then raise exception 'FAIL owner list overwritten';end if;
 if not exists(select 1 from public.wishlists where owner_id=current_setting('atlas.wish.other')::uuid and items='[]'::jsonb) then raise exception 'FAIL other account isolation';end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('atlas.wish.owner'),true),set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('atlas.wish.owner'),'role','authenticated')::text,true);
do $$ declare w public.wishlists;begin
 select * into w from public.wishlists where owner_id=auth.uid();perform public.atlas_save_wishlist(w.items,true,w.revision);
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true);
do $$ begin
 if (select count(*) from public.wishlists where owner_id=current_setting('atlas.wish.owner')::uuid)<>1 then raise exception 'FAIL public read';end if;
end $$;
reset role;
update public.profiles set is_public=false where id=current_setting('atlas.wish.owner')::uuid;
set local role anon;
do $$ begin
 if exists(select 1 from public.wishlists where owner_id=current_setting('atlas.wish.owner')::uuid) then raise exception 'FAIL hidden profile wishlist';end if;
end $$;
reset role;
update public.profiles set is_public=true where id=current_setting('atlas.wish.owner')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('atlas.wish.owner'),true),set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('atlas.wish.owner'),'role','authenticated')::text,true);
do $$ declare w public.wishlists;begin
 select * into w from public.wishlists where owner_id=auth.uid();perform public.atlas_save_wishlist(w.items,false,w.revision);
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true);
do $$ begin
 if exists(select 1 from public.wishlists where owner_id=current_setting('atlas.wish.owner')::uuid) then raise exception 'FAIL public-to-private transition';end if;
end $$;
reset role;
select 'PASS: wish list, privacidade e permissões' as resultado;
rollback;

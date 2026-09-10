-- Smoke-Test 0038: Produktstamm — Import-Stand, Spalten-Grants (Einkaufsdaten nicht für authenticated), Fristen FLS27, upsert_product/upsert_product_component nur Partner-Team, admin_products.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_pid uuid; v_uid uuid; v_email text; v_ed uuid;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary where p.auth_user_id is not null limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  delete from role_assignment where person_id = v_pid; delete from staff_user where auth_user_id = v_uid; -- Testperson ohne Vorrechte (Rollback stellt alles wieder her)
  select id into v_ed from event where is_edition and slug = 'fls27';
  insert into t_res values ('01_import_counts', (select count(*)::text from product) || ' components=' || (select count(*)::text from product_component)
                                                || ' packages=' || (select count(*)::text from product where type = 'package') || ' shop_visible=' || (select count(*)::text from product where shop_visible));
  insert into t_res values ('02_bundles', (select string_agg(bundle_sku || ':' || n::text, ', ' order by bundle_sku) from (select bundle_sku, count(*) n from product_component group by bundle_sku) s));
  insert into t_res values ('03_col_privileges', 'purchase_hidden=' || (not has_column_privilege('authenticated', 'public.product', 'purchase_price_cents', 'select'))::text
                                                  || ' margin_hidden=' || (not has_column_privilege('authenticated', 'public.product', 'margin', 'select'))::text
                                                  || ' supplier_hidden=' || (not has_column_privilege('authenticated', 'public.product', 'supplier', 'select'))::text
                                                  || ' name_ok=' || has_column_privilege('authenticated', 'public.product', 'name_de', 'select')::text
                                                  || ' tbl_select=' || has_table_privilege('authenticated', 'public.product', 'select')::text);
  insert into t_res values ('04_deadlines_fls27', (select string_agg(key || '=' || to_char(due_at at time zone 'Europe/Berlin', 'DD.MM.YYYY HH24:MI'), ', ' order by due_at, key) from deadline where edition_id = v_ed and audience = 'partner'));
  begin
    perform upsert_product(jsonb_build_object('sku', 'I-99999', 'name_de', 'Test', 'category', 'merch'));
    insert into t_res values ('05_upsert_as_nobody', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('05_upsert_as_nobody', 'rejected ' || sqlstate); end;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  perform upsert_product(jsonb_build_object('sku', 'I-99999', 'name_de', 'Testflasche', 'category', 'merch', 'type', 'shop_item', 'net_price_cents', 1290, 'shop_visible', true,
                                            'merch_config', jsonb_build_object('fields', jsonb_build_array('logo_svg', 'qty', 'sizes'))));
  insert into t_res values ('06_upsert_insert', (select type || ' ' || category || ' ' || net_price_cents::text || ' vat=' || vat_rate::text || ' merch=' || (merch_config is not null)::text from product where sku = 'I-99999'));
  perform upsert_product(jsonb_build_object('sku', 'I-99999', 'net_price_cents', 1490, 'active', false));
  insert into t_res values ('07_upsert_partial', (select net_price_cents::text || ' active=' || active::text || ' name=' || name_de from product where sku = 'I-99999'));
  begin
    perform upsert_product(jsonb_build_object('sku', 'I-99999', 'category', 'unbekannt'));
    insert into t_res values ('08_invalid_category', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('08_invalid_category', 'rejected ' || sqlerrm); end;
  perform upsert_product_component('I-99999', 'I-53563', 2);
  insert into t_res values ('09_component', (select qty::text from product_component where bundle_sku = 'I-99999' and component_sku = 'I-53563'));
  perform upsert_product_component('I-99999', 'I-53563', 0);
  insert into t_res values ('10_component_removed', (select count(*)::text from product_component where bundle_sku = 'I-99999'));
  insert into t_res values ('11_admin_products', (select count(*)::text || ' with_purchase=' || count(*) filter (where purchase_price_cents is not null)::text from admin_products()));
  delete from role_assignment where person_id = v_pid;
  insert into t_res values ('12_admin_products_as_nobody', (select count(*)::text from admin_products()));
  insert into t_res values ('13_audit', (select count(*)::text from audit_log where action like 'product.%' and created_at >= now()));
end $$;
select * from t_res order by step;
rollback;

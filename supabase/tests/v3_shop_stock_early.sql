-- Smoke-Test 0061: shop_upsert_line prüft den Bestand sofort — 99 von 10 ⇒ P0001 out_of_stock detail <sku>:10; 10 geht; nach Bestätigung (Reservierung −10)
-- und Wiederöffnen darf dieselbe Bestellung 10 behalten (eigene Reservierung zählt nicht gegen sich), 11 ⇒ out_of_stock :10; eine zweite Org bekommt :0.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_org uuid; v_org2 uuid; v_oe uuid; v_oe2 uuid; v_o uuid; v_detail text; v_sku text := 'I-17066';
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email from person p join person_email pe on pe.person_id = p.id and pe.is_primary where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid; delete from staff_user where auth_user_id = v_uid;
  select id into v_ed from event where is_edition and slug = 'fls27';
  update product set track_stock = true, stock_total = 10, active = true, shop_visible = true where sku = v_sku; -- Testzustand, Rollback
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  insert into organization (legal_name, communication_name, type) values ('Lager GmbH', 'Lager', 'corporate') returning id into v_org;
  insert into organization (legal_name, communication_name, type) values ('Zweite GmbH', 'Zweite', 'corporate') returning id into v_org2;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited') returning id into v_oe;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org2, v_ed, 'invited') returning id into v_oe2;
  perform upsert_partner_contact(v_org, v_email, 'Test', 'Person', '{primary_ops}');
  perform upsert_partner_contact(v_org2, v_email, 'Test', 'Person', '{primary_ops}');
  delete from role_assignment where person_id = v_pid and role = 'area_lead_partner';
  insert into t_res values ('01_available', coalesce(shop_stock_available(v_sku)::text, 'null'));
  begin
    perform shop_upsert_line(v_org, v_sku, 99);
    insert into t_res values ('02_too_many', 'ALLOWED (BUG)');
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    insert into t_res values ('02_too_many', 'rejected ' || sqlstate || ' ' || sqlerrm || ' ' || coalesce(v_detail, ''));
  end;
  v_o := shop_upsert_line(v_org, v_sku, 10);
  insert into t_res values ('03_ten_ok', (select qty::text from shop_order_line where order_id = v_o and product_sku = v_sku));
  perform shop_confirm(v_o, null);
  insert into t_res values ('04_confirmed', (select status from shop_order where id = v_o) || ' available=' || coalesce(shop_stock_available(v_sku)::text, 'null'));
  perform shop_edit(v_o);
  perform shop_upsert_line(v_org, v_sku, 10);
  insert into t_res values ('05_own_reservation_counts', (select status || ' qty=' || (select qty::text from shop_order_line where order_id = v_o and product_sku = v_sku) from shop_order where id = v_o));
  begin
    perform shop_upsert_line(v_org, v_sku, 11);
    insert into t_res values ('06_eleven', 'ALLOWED (BUG)');
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    insert into t_res values ('06_eleven', 'rejected ' || sqlstate || ' ' || coalesce(v_detail, ''));
  end;
  begin
    perform shop_upsert_line(v_org2, v_sku, 1);
    insert into t_res values ('07_other_org', 'ALLOWED (BUG)');
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    insert into t_res values ('07_other_org', 'rejected ' || sqlstate || ' ' || coalesce(v_detail, ''));
  end;
end $$;
select * from t_res order by step;
rollback;

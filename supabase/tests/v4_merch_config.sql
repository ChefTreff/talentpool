-- Smoke-Test 0064: shop_confirm prüft die Merch-Konfiguration. Ohne Konfiguration ⇒ P0001 merch_incomplete detail <sku>:logo;
-- Größenverteilung ungleich Bestellmenge ⇒ :sizes; Auswahlwert ausserhalb der Liste ⇒ :farbe; Aufdruck über der Grenze ⇒ :print;
-- vollständig ⇒ bestätigt. Ein Produkt ohne Schema bleibt unberührt. Die beiden Helfer sind für `authenticated` gesperrt.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_org uuid; v_oe uuid; v_o uuid; v_detail text;
        v_merch text := 'I-99001'; v_plain text := 'I-99002';
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid; delete from staff_user where auth_user_id = v_uid;
  select id into v_ed from event where is_edition and slug = 'fls27';

  -- Zwei Wegwerf-Produkte: eines mit Schema, eines ohne (Rollback räumt beide weg).
  insert into product (sku, name_de, name_en, type, category, unit, net_price_cents, vat_rate, active, shop_visible, merch_config)
  values (v_merch, 'Testshirt', 'Test shirt', 'shop_item', 'merch', 'piece', 1500, 7, true, true,
          jsonb_build_array(
            jsonb_build_object('key', 'logo', 'type', 'logo', 'label_de', 'Logo', 'label_en', 'Logo', 'required', true),
            jsonb_build_object('key', 'sizes', 'type', 'sizes', 'label_de', 'Größen', 'label_en', 'Sizes', 'required', true,
                               'options', jsonb_build_array('S', 'M', 'L')),
            jsonb_build_object('key', 'farbe', 'type', 'select', 'label_de', 'Farbe', 'label_en', 'Colour', 'required', false,
                               'options', jsonb_build_array('schwarz', 'weiß')),
            jsonb_build_object('key', 'print', 'type', 'text', 'label_de', 'Aufdruck', 'label_en', 'Print', 'required', false,
                               'max_length', 5)));
  insert into product (sku, name_de, name_en, type, category, unit, net_price_cents, vat_rate, active, shop_visible)
  values (v_plain, 'Testbeigabe', 'Test extra', 'shop_item', 'merch', 'piece', 500, 7, true, true);

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  insert into organization (legal_name, communication_name, type) values ('Merch Test GmbH', 'Merch Test', 'corporate') returning id into v_org;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited') returning id into v_oe;
  perform upsert_partner_contact(v_org, v_email, 'Test', 'Person', '{primary_ops}');
  delete from role_assignment where person_id = v_pid and role = 'area_lead_partner'; -- ab hier nur noch Partner-Rechte

  -- 01 Zeile ohne Konfiguration darf im Warenkorb stehen (halber Stand bleibt erlaubt)
  v_o := shop_upsert_line(v_org, v_merch, 3);
  insert into t_res values ('01_line_without_config',
    (select coalesce(l.merch_config::text, 'null') from shop_order_line l where l.order_id = v_o and l.product_sku = v_merch));

  -- 02 … bestätigen aber nicht
  begin
    perform shop_confirm(v_o, null);
    insert into t_res values ('02_confirm_without_config', 'ALLOWED (BUG)');
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    insert into t_res values ('02_confirm_without_config', 'rejected ' || sqlstate || ' ' || sqlerrm || ' ' || coalesce(v_detail, ''));
  end;

  -- 03 Größen treffen die Bestellmenge nicht (2 statt 3)
  perform shop_upsert_line(v_org, v_merch, 3,
    jsonb_build_object('logo', 'asset-1', 'sizes', jsonb_build_object('S', 1, 'M', 1)));
  begin
    perform shop_confirm(v_o, null);
    insert into t_res values ('03_sizes_mismatch', 'ALLOWED (BUG)');
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    insert into t_res values ('03_sizes_mismatch', 'rejected ' || sqlerrm || ' ' || coalesce(v_detail, ''));
  end;

  -- 04 Auswahlwert, den es nicht gibt
  perform shop_upsert_line(v_org, v_merch, 3,
    jsonb_build_object('logo', 'asset-1', 'sizes', jsonb_build_object('S', 1, 'M', 2), 'farbe', 'pink'));
  begin
    perform shop_confirm(v_o, null);
    insert into t_res values ('04_bad_option', 'ALLOWED (BUG)');
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    insert into t_res values ('04_bad_option', 'rejected ' || coalesce(v_detail, ''));
  end;

  -- 05 Aufdruck über der Zeichengrenze
  perform shop_upsert_line(v_org, v_merch, 3,
    jsonb_build_object('logo', 'asset-1', 'sizes', jsonb_build_object('S', 1, 'M', 2), 'print', 'viel zu lang'));
  begin
    perform shop_confirm(v_o, null);
    insert into t_res values ('05_too_long', 'ALLOWED (BUG)');
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    insert into t_res values ('05_too_long', 'rejected ' || coalesce(v_detail, ''));
  end;

  -- 06 Produkt ohne Schema bleibt unberührt
  perform shop_upsert_line(v_org, v_plain, 2);
  insert into t_res values ('06_plain_product', 'in cart');

  -- 07 Vollständig ⇒ bestätigt
  perform shop_upsert_line(v_org, v_merch, 3,
    jsonb_build_object('logo', 'asset-1', 'sizes', jsonb_build_object('S', 1, 'M', 2), 'farbe', 'schwarz', 'print', 'Hallo'));
  perform shop_confirm(v_o, null);
  insert into t_res values ('07_complete', (select status from shop_order where id = v_o));

  -- 08 Konfiguration überlebt eine reine Mengenänderung (coalesce in shop_upsert_line)
  perform shop_edit(v_o);
  perform shop_upsert_line(v_org, v_merch, 3);
  insert into t_res values ('08_config_survives_qty',
    (select coalesce(l.merch_config->>'logo', 'weg') from shop_order_line l where l.order_id = v_o and l.product_sku = v_merch));

  -- 09 Helfer sind nicht für Angemeldete ausführbar
  insert into t_res values ('09_grants',
    'merch_fields=' || has_function_privilege('authenticated', 'merch_fields(jsonb)', 'execute')::text ||
    ' merch_problem=' || has_function_privilege('authenticated', 'merch_problem(jsonb,jsonb,numeric)', 'execute')::text);

  -- 10 Ein leeres Schema am Produkt heißt „kein Merch-Artikel"
  insert into t_res values ('10_no_schema',
    'plain=' || jsonb_array_length(merch_fields((select merch_config from product where sku = v_plain)))::text ||
    ' merch=' || jsonb_array_length(merch_fields((select merch_config from product where sku = v_merch)))::text);
end $$;
select * from t_res order by step;
rollback;

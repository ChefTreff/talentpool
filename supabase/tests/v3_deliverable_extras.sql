-- Smoke-Test 0053/0054: my_partner_assets (alle Fassungen, Beschriftung aus der Pflicht, fremde Org 42501), answers_schema (Pflichtfeld fehlt ⇒ P0001 answers_incomplete,
-- vollständig ⇒ submitted), fulfilled_by_sku: Lunch-Paket-Pflicht wird durch die bestätigte Shop-Bestellung erledigt (accepted, Bestellung als Beleg) und beim
-- Storno wieder geöffnet; Partner darf sie nicht manuell einreichen (P0001 fulfilled_by_order), das Team schon, und diese Einreichung bleibt bei Storno stehen;
-- my_deliverables liefert answers_schema/fulfilled_by_sku.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_org uuid; v_org2 uuid; v_oe uuid; v_d_lunch uuid; v_d_logo uuid; v_d_form uuid; v_tpl uuid; v_o1 uuid; v_o2 uuid; v_path text; v_a1 jsonb; v_a2 jsonb; v_json jsonb; v_detail text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid; delete from staff_user where auth_user_id = v_uid; -- Testperson ohne Vorrechte (Rollback stellt alles wieder her)
  select id into v_ed from event where is_edition and slug = 'fls27';
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  insert into organization (legal_name, communication_name, type) values ('Extras GmbH', 'Extras', 'corporate') returning id into v_org;
  insert into organization (legal_name, communication_name, type) values ('Fremd GmbH', 'Fremd', 'corporate') returning id into v_org2;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited') returning id into v_oe;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org2, v_ed, 'invited');
  insert into org_product (org_edition_id, product_sku, qty, unit_price_cents) values (v_oe, 'I-50131', 1, 1190000);
  perform upsert_partner_contact(v_org, v_email, 'Test', 'Person', '{primary_ops}');
  -- Formular-Vorlage mit Schema (global) anlegen und Checklisten ableiten
  v_tpl := upsert_deliverable_template(jsonb_build_object('key', 'test_form_schema', 'type', 'form', 'label_de', 'Ansprechpartner Aufbau', 'label_en', 'Setup contact', 'sort', 98,
                                                          'answers_schema', jsonb_build_array(jsonb_build_object('key', 'contact_person', 'label_de', 'Name', 'type', 'text', 'required', true),
                                                                                              jsonb_build_object('key', 'notes', 'label_de', 'Hinweise', 'type', 'textarea', 'required', false))));
  perform resync_deliverables(v_ed);
  delete from role_assignment where person_id = v_pid and role = 'area_lead_partner';
  select id into v_d_lunch from deliverable where org_edition_id = v_oe and key = 'lunch_package';
  select id into v_d_logo from deliverable where org_edition_id = v_oe and key = 'logo_vector';
  select id into v_d_form from deliverable where org_edition_id = v_oe and key = 'test_form_schema';
  insert into t_res values ('01_my_deliverables_new_cols', (select 'lunch_fulfilled_by=' || coalesce(fulfilled_by_sku, '-') from my_deliverables(v_org) where key = 'lunch_package')
                                                            || ' form_schema_fields=' || (select jsonb_array_length(answers_schema)::text from my_deliverables(v_org) where key = 'test_form_schema'));
  -- Formular: Pflichtfeld fehlt ⇒ answers_incomplete; vollständig ⇒ submitted
  begin
    perform submit_deliverable(v_d_form, '{}'::uuid[], '{"notes": "nur Hinweise"}'::jsonb);
    insert into t_res values ('02_form_incomplete', 'ALLOWED (BUG)');
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    insert into t_res values ('02_form_incomplete', 'rejected ' || sqlstate || ' ' || sqlerrm || ' detail=' || coalesce(v_detail, '-'));
  end;
  perform submit_deliverable(v_d_form, '{}'::uuid[], '{"contact_person": "Anna Muster", "notes": ""}'::jsonb);
  insert into t_res values ('03_form_complete', (select status || ' answers=' || (answers->>'contact_person') from deliverable where id = v_d_form));
  -- Lunch-Paket: Bestellung bestätigen ⇒ Pflicht automatisch eingereicht; Storno ⇒ wieder offen
  v_o1 := shop_upsert_line(v_org, 'I-79520', 2);
  insert into t_res values ('04_draft_no_effect', (select status from deliverable where id = v_d_lunch));
  v_json := shop_confirm(v_o1);
  insert into t_res values ('05_confirmed_fulfils', (select status || ' auto=' || coalesce(answers->>'auto', '-') || ' order_no_ok=' || ((answers->>'order_no') = (v_json->>'order_no'))::text || ' by=' || coalesce(submitted_by::text, 'null') || ' reviewed=' || (reviewed_at is not null)::text from deliverable where id = v_d_lunch));
  perform shop_cancel(v_o1);
  insert into t_res values ('06_cancel_reopens', (select status || ' answers=' || answers::text from deliverable where id = v_d_lunch));
  -- Partner darf die Buchungs-Pflicht nicht manuell einreichen; das Team schon, und diese Einreichung bleibt bei Storno stehen
  begin
    perform submit_deliverable(v_d_lunch, '{}'::uuid[], '{}'::jsonb);
    insert into t_res values ('07a_partner_manual', 'ALLOWED (BUG)');
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    insert into t_res values ('07a_partner_manual', 'rejected ' || sqlstate || ' ' || sqlerrm || ' detail=' || coalesce(v_detail, '-'));
  end;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  perform submit_deliverable(v_d_lunch, '{}'::uuid[], '{}'::jsonb);
  delete from role_assignment where person_id = v_pid and role = 'area_lead_partner';
  v_o2 := shop_upsert_line(v_org, 'I-79520', 1);
  v_json := shop_confirm(v_o2);
  perform shop_cancel(v_o2);
  insert into t_res values ('07b_team_manual_stays', (select status || ' by_me=' || (submitted_by = v_pid)::text from deliverable where id = v_d_lunch));
  -- my_partner_assets: zwei Logo-Fassungen, alle sichtbar, Beschriftung aus der Pflicht; fremde Org 42501
  v_path := v_ed::text || '/' || v_org::text || '/logo_vector/v1.svg';
  insert into storage.objects (bucket_id, name) values ('partner-assets', v_path), ('partner-assets', v_ed::text || '/' || v_org::text || '/logo_vector/v2.svg');
  v_a1 := register_partner_asset(v_org, 'logo_vector', v_path, 'v1.svg', 'image/svg+xml', 100, v_d_logo);
  v_a2 := register_partner_asset(v_org, 'logo_vector', v_ed::text || '/' || v_org::text || '/logo_vector/v2.svg', 'v2.svg', 'image/svg+xml', 120, v_d_logo);
  insert into t_res values ('08_my_assets', (select count(*)::text || ' current=' || string_agg(case when is_current then 'v' || version::text end, ',') || ' replaced=' || count(*) filter (where not is_current)::text
                                                     || ' key=' || max(deliverable_key) || ' label=' || max(label_de) from my_partner_assets(v_org)));
  begin
    perform my_partner_assets(v_org2);
    insert into t_res values ('09_foreign_assets', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('09_foreign_assets', 'rejected ' || sqlstate); end;
  insert into t_res values ('10_grants', 'sync_exec=' || has_function_privilege('authenticated', 'shop_sync_fulfilled_deliverables(uuid)', 'execute')::text
                                          || ' my_assets_exec=' || has_function_privilege('authenticated', 'my_partner_assets(uuid,uuid)', 'execute')::text);
end $$;
select * from t_res order by step;
rollback;

-- Smoke-Test 0041/0042: Partner-Checkliste entsteht nur aus gebuchten Leistungen (Trigger), Fristen aus deadline, Pfadregel und Datei-Regeln der Uploads,
-- Versionierung, Logo-Pflicht im Onboarding, Eingangsbestätigung an Einreichenden + Hauptkontakt, Ablehnung mit Grund + erneute Einreichung, Team-Queue,
-- Storno ⇒ not_required, Stand-Pflege, Vorlagenpflege + Resync, Grants.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_org uuid; v_oe uuid; v_p1 uuid; v_json jsonb; v_d_logo uuid; v_d_back uuid; v_d_lunch uuid; v_d_form uuid;
        v_a1 jsonb; v_a2 jsonb; v_path text; v_tpl uuid; v_n integer;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary where p.auth_user_id is not null limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  delete from role_assignment where person_id = v_pid; delete from staff_user where auth_user_id = v_uid; -- Testperson ohne Vorrechte (Rollback stellt alles wieder her)
  select id into v_ed from event where is_edition and slug = 'fls27';
  -- Org + Edition (Trigger legt die globale Logo-Pflicht an), dann Leistungen buchen
  insert into organization (legal_name, communication_name, type) values ('Deliverable Test GmbH', 'DelivTest', 'partner') returning id into v_org;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited') returning id into v_oe;
  insert into t_res values ('01_after_org_edition', (select string_agg(key, ',' order by key) from deliverable where org_edition_id = v_oe));
  insert into org_product (org_edition_id, product_sku, qty, unit_price_cents) values (v_oe, 'I-50131', 1, 1190000), (v_oe, 'I-32776', 4, 0);
  insert into t_res values ('02_after_products', (select string_agg(key || ':' || status || ':' || coalesce(to_char(due_at at time zone 'Europe/Berlin', 'DD.MM.YYYY HH24:MI'), '-'), ', ' order by key)
                                                   from deliverable where org_edition_id = v_oe));
  select id into v_d_logo from deliverable where org_edition_id = v_oe and key = 'logo_vector';
  select id into v_d_back from deliverable where org_edition_id = v_oe and key = 'backdrop_print';
  select id into v_d_lunch from deliverable where org_edition_id = v_oe and key = 'lunch_package';
  -- Hauptkontakt + Testperson als additional (als Team anlegen, dann Team-Rolle weg ⇒ Partner-Sicht)
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  v_p1 := upsert_partner_contact(v_org, 'primary.deliv@example.com', 'Prima', 'Ops', '{primary_ops}');
  perform upsert_partner_contact(v_org, v_email, 'Test', 'Person', '{additional}');
  delete from role_assignment where person_id = v_pid and role = 'area_lead_partner';
  -- Onboarding ohne Logo bleibt invited
  v_json := update_partner_onboarding(v_org, jsonb_build_object('address_street', 'Weg 2', 'address_zip', '20095', 'address_city', 'Hamburg', 'invoice_email', 'acc@example.com', 'description_de', 'Text.'));
  insert into t_res values ('03_onboarding_without_logo', v_json->>'onboarding_status');
  -- Pfadregel <edition>/<org>/<kind>/<datei>
  v_path := v_ed::text || '/' || v_org::text || '/logo_vector/logo-v1.svg';
  insert into t_res values ('04_path_rules', 'own_write=' || partner_asset_path_allowed(v_path, true)::text
                                              || ' foreign_org=' || partner_asset_path_allowed(v_ed::text || '/' || gen_random_uuid()::text || '/logo_vector/x.svg', true)::text
                                              || ' bad_kind=' || partner_asset_path_allowed(v_ed::text || '/' || v_org::text || '/Logo/x.svg', true)::text
                                              || ' no_file=' || partner_asset_path_allowed(v_ed::text || '/' || v_org::text || '/logo_vector/', true)::text);
  -- Registrieren ohne Objekt ⇒ P0002
  begin
    perform register_partner_asset(v_org, 'logo_vector', v_path, 'logo-v1.svg', 'image/svg+xml', 1200, v_d_logo);
    insert into t_res values ('05_object_missing', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('05_object_missing', 'rejected ' || sqlstate || ' ' || sqlerrm); end;
  insert into storage.objects (bucket_id, name) values ('partner-assets', v_path);
  -- PNG als Logo ⇒ 22023 file_rules (Vorlage)
  insert into storage.objects (bucket_id, name) values ('partner-assets', v_ed::text || '/' || v_org::text || '/logo_vector/logo.png');
  begin
    perform register_partner_asset(v_org, 'logo_vector', v_ed::text || '/' || v_org::text || '/logo_vector/logo.png', 'logo.png', 'image/png', 900, v_d_logo);
    insert into t_res values ('06_png_logo', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('06_png_logo', 'rejected ' || sqlstate || ' ' || sqlerrm); end;
  -- Pfad passt nicht zur Art ⇒ 22023
  begin
    perform register_partner_asset(v_org, 'backdrop', v_path, 'logo-v1.svg', 'image/svg+xml', 1200);
    insert into t_res values ('07_path_mismatch', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('07_path_mismatch', 'rejected ' || sqlstate || ' ' || sqlerrm); end;
  v_a1 := register_partner_asset(v_org, 'logo_vector', v_path, 'logo-v1.svg', 'image/svg+xml', 1200, v_d_logo);
  insert into t_res values ('08_logo_registered', 'version=' || (v_a1->>'version') || ' onboarding=' || (select onboarding_status from org_edition where id = v_oe)
                                                   || ' filled_at=' || (select (onboarding_filled_at is not null)::text from org_edition where id = v_oe));
  -- zweite Fassung ⇒ Version 2, erste nicht mehr aktuell
  insert into storage.objects (bucket_id, name) values ('partner-assets', v_ed::text || '/' || v_org::text || '/logo_vector/logo-v2.eps');
  v_a2 := register_partner_asset(v_org, 'logo_vector', v_ed::text || '/' || v_org::text || '/logo_vector/logo-v2.eps', 'logo-v2.eps', 'application/postscript', 5000, v_d_logo);
  insert into t_res values ('09_versioning', 'v2=' || (v_a2->>'version') || ' v1_current=' || (select is_current::text from partner_asset where id = (v_a1->>'id')::uuid)
                                              || ' current_count=' || (select count(*)::text from partner_asset where org_edition_id = v_oe and kind = 'logo_vector' and is_current));
  -- Einreichen ohne Datei ⇒ 22023; mit Datei ⇒ submitted + Eingangsbestätigung an Einreichenden und Hauptkontakt (2 Personen)
  begin
    perform submit_deliverable(v_d_logo, '{}'::uuid[]);
    insert into t_res values ('10_submit_without_asset', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('10_submit_without_asset', 'rejected ' || sqlstate || ' ' || sqlerrm); end;
  perform submit_deliverable(v_d_logo, array[(v_a2->>'id')::uuid]);
  insert into t_res values ('11_submitted', (select status || ' by_me=' || (submitted_by = v_pid)::text from deliverable where id = v_d_logo)
                                             || ' mails=' || (select count(*)::text from mail_log where template_key = 'partner_deliverable_received' and related_id = v_d_logo)
                                             || ' recipients=' || (select count(distinct person_id)::text from mail_log where template_key = 'partner_deliverable_received' and related_id = v_d_logo)
                                             || ' locales=' || (select string_agg(locale, ',' order by locale) from mail_log where template_key = 'partner_deliverable_received' and related_id = v_d_logo));
  begin
    perform submit_deliverable(v_d_logo, array[(v_a2->>'id')::uuid]);
    insert into t_res values ('12_resubmit_while_submitted', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('12_resubmit_while_submitted', 'rejected ' || sqlstate || ' ' || sqlerrm); end;
  -- Partner darf nicht prüfen
  begin
    perform review_deliverable(v_d_logo, true);
    insert into t_res values ('13_partner_review', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('13_partner_review', 'rejected ' || sqlstate); end;
  insert into t_res values ('14_my_deliverables', (select count(*)::text || ' ' || string_agg(key || ':' || status, ',' order by sort, key)
                                                          || ' assets_logo=' || max(case when key = 'logo_vector' then jsonb_array_length(assets)::text end) from my_deliverables(v_org)));
  v_json := partner_overview(v_org);
  insert into t_res values ('15_overview_checklist', 'total=' || (v_json->'checklist'->>'total') || ' done=' || (v_json->'checklist'->>'done') || ' open=' || (v_json->'checklist'->>'open')
                                                      || ' booth=' || coalesce(v_json->>'booth', 'null'));
  -- Team: Ablehnung ohne Grund ⇒ 22023; mit Grund ⇒ rejected, Datei rejected, Mail mit Grund an Einreichenden + Hauptkontakt
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  begin
    perform review_deliverable(v_d_logo, false, '  ');
    insert into t_res values ('16_reject_without_note', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('16_reject_without_note', 'rejected ' || sqlstate || ' ' || sqlerrm); end;
  perform review_deliverable(v_d_logo, false, 'Logo ist nicht vektorisiert.');
  insert into t_res values ('17_rejected', (select status || ' note=' || coalesce(review_note, '-') from deliverable where id = v_d_logo)
                                            || ' asset=' || (select status from partner_asset where id = (v_a2->>'id')::uuid)
                                            || ' mails=' || (select count(*)::text from mail_log where template_key = 'partner_deliverable_rejected' and related_id = v_d_logo)
                                            || ' note_in_vars=' || (select (meta->'vars'->>'note' = 'Logo ist nicht vektorisiert.')::text from mail_log where template_key = 'partner_deliverable_rejected' and related_id = v_d_logo limit 1));
  insert into t_res values ('18_review_queue', (select count(*)::text || ' status=' || max(status) || ' org=' || max(org_name) from partner_review_queue(v_ed) where org_id = v_org));
  -- erneut einreichen, dann annehmen (die noch wartende Eingangsbestätigung wird nicht dupliziert)
  perform submit_deliverable(v_d_logo, array[(v_a2->>'id')::uuid]);
  perform review_deliverable(v_d_logo, true);
  insert into t_res values ('19_accepted', (select status || ' note=' || coalesce(review_note, '-') from deliverable where id = v_d_logo) || ' asset=' || (select status from partner_asset where id = (v_a2->>'id')::uuid)
                                            || ' received_mails=' || (select count(*)::text from mail_log where template_key = 'partner_deliverable_received' and related_id = v_d_logo));
  -- Storno ⇒ Rückwand und Lunch-Paket not_required und ausgeblendet; erneut gebucht ⇒ open
  update org_product set status = 'cancelled' where org_edition_id = v_oe and product_sku = 'I-50131';
  insert into t_res values ('20_cancelled', 'backdrop=' || (select status from deliverable where id = v_d_back) || ' lunch=' || (select status from deliverable where id = v_d_lunch)
                                             || ' visible=' || (select count(*)::text from my_deliverables(v_org) where key in ('backdrop_print', 'lunch_package')));
  update org_product set status = 'booked' where org_edition_id = v_oe and product_sku = 'I-50131';
  insert into t_res values ('21_rebooked', 'backdrop=' || (select status from deliverable where id = v_d_back) || ' lunch=' || (select status from deliverable where id = v_d_lunch));
  -- Stand pflegen (Teilupdate) ⇒ Übersicht zeigt Maße, keine internen Notizen
  perform upsert_booth(v_org, jsonb_build_object('booth_number', 'B12', 'length_m', 3, 'width_m', 3, 'backdrop_w_mm', 2960, 'backdrop_h_mm', 2400, 'notes', 'intern'));
  perform upsert_booth(v_org, jsonb_build_object('booth_number', 'B14'));
  v_json := partner_overview(v_org);
  insert into t_res values ('22_booth', (v_json->'booth'->>'booth_number') || ' w=' || (v_json->'booth'->>'backdrop_w_mm') || ' h=' || (v_json->'booth'->>'backdrop_h_mm')
                                         || ' notes_hidden=' || (not (v_json->'booth' ? 'notes'))::text);
  -- Vorlage anlegen (Formular, global) ⇒ Resync ⇒ neue Pflicht; Formular ohne Antworten ⇒ 22023
  v_tpl := upsert_deliverable_template(jsonb_build_object('key', 'test_form', 'type', 'form', 'label_de', 'Testformular', 'label_en', 'Test form', 'sort', 99));
  v_n := resync_deliverables(v_ed);
  select id into v_d_form from deliverable where org_edition_id = v_oe and key = 'test_form';
  begin
    perform submit_deliverable(v_d_form, '{}'::uuid[], '{}'::jsonb);
    insert into t_res values ('23_form_without_answers', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('23_form_without_answers', 'rejected ' || sqlstate || ' ' || sqlerrm); end;
  perform submit_deliverable(v_d_form, '{}'::uuid[], '{"q1": "ja"}'::jsonb);
  insert into t_res values ('24_form_submitted', (select status || ' answers=' || answers::text from deliverable where id = v_d_form) || ' resynced_org_editions=' || v_n::text);
  perform upsert_deliverable_template(jsonb_build_object('id', v_tpl, 'active', false));
  perform resync_deliverables(v_ed);
  insert into t_res values ('25_template_deactivated_keeps_submitted', (select status from deliverable where id = v_d_form));
  insert into t_res values ('26_admin_overview', (select 'open=' || max(deliverables_open)::text || ' submitted=' || max(deliverables_submitted)::text || ' booth=' || max(booth_number) from partner_admin_overview(v_ed) where org_id = v_org));
  insert into t_res values ('27_grants', 'deliverable_insert=' || has_table_privilege('authenticated', 'public.deliverable', 'insert')::text
                                          || ' asset_update=' || has_table_privilege('authenticated', 'public.partner_asset', 'update')::text
                                          || ' booth_select=' || has_table_privilege('authenticated', 'public.booth', 'select')::text
                                          || ' anon_select=' || has_table_privilege('anon', 'public.deliverable', 'select')::text
                                          || ' sync_exec_auth=' || has_function_privilege('authenticated', 'sync_deliverables(uuid)', 'execute')::text
                                          || ' lunch_late=' || (select late_orderable::text from product where sku = 'I-79520'));
  insert into t_res values ('28_audit', (select string_agg(action || '=' || n::text, ', ' order by action) from (select action, count(*) n from audit_log where action like 'partner.%' and created_at >= now() group by action) s));
end $$;
select * from t_res order by step;
rollback;

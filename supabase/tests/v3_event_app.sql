-- Smoke-Test 0055: set_edition_swapcard (Team), event_app_exhibitors (Org der Edition mit Beschreibung, Level, Stand, freigegebenem Logo, event_app_member-Kontakt;
-- ohne Edition nur Editionen mit Swapcard-ID), set_event_app_ref (Upsert, eine Zeile je Org×Edition, sichtbar im Export); Partner ohne Team-Rolle ⇒ 42501;
-- ungültiges System ⇒ 22023.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_org uuid; v_oe uuid; v_d_logo uuid; v_path text; v_a jsonb;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid; delete from staff_user where auth_user_id = v_uid;
  select id into v_ed from event where is_edition and slug = 'fls27';
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  perform set_edition_swapcard(v_ed, ' evt_test_123 ');
  insert into t_res values ('01_edition_id', (select coalesce(swapcard_event_id, '-') from event where id = v_ed));
  insert into organization (legal_name, communication_name, type, website) values ('Expo GmbH', 'Expo', 'corporate', 'expo.example') returning id into v_org;
  insert into org_edition (org_id, edition_id, onboarding_status, description_de, sponsoring_level) values (v_org, v_ed, 'filled', 'Wir bauen Messen.', 'Premium') returning id into v_oe;
  insert into org_product (org_edition_id, product_sku, qty, unit_price_cents) values (v_oe, 'I-50131', 1, 1190000);
  perform upsert_partner_contact(v_org, v_email, 'Test', 'Person', '{primary_ops,event_app_member}');
  insert into booth (org_edition_id, booth_number) values (v_oe, 'A12');
  select id into v_d_logo from deliverable where org_edition_id = v_oe and key = 'logo_vector';
  v_path := v_ed::text || '/' || v_org::text || '/logo_vector/logo.svg';
  insert into storage.objects (bucket_id, name) values ('partner-assets', v_path);
  v_a := register_partner_asset(v_org, 'logo_vector', v_path, 'logo.svg', 'image/svg+xml', 100, v_d_logo);
  perform submit_deliverable(v_d_logo, array[(v_a->>'id')::uuid], '{}'::jsonb);
  insert into t_res values ('02_logo_before_review', (select coalesce(logo_path, 'null') from event_app_exhibitors(v_ed) where org_id = v_org));
  perform review_deliverable(v_d_logo, true, null);
  insert into t_res values ('03_export', (select name || ' level=' || coalesce(sponsoring_level, '-') || ' booth=' || coalesce(booth_number, '-') || ' web=' || coalesce(website, '-')
                                                 || ' logo=' || (logo_path = v_path)::text || ' members=' || jsonb_array_length(members)::text || ' member_email_ok=' || ((members->0->>'email') = v_email)::text
                                                 || ' ref=' || coalesce(swapcard_exhibitor_id, 'null') from event_app_exhibitors(v_ed) where org_id = v_org));
  insert into t_res values ('04_export_all_editions', (select count(*)::text from event_app_exhibitors() where org_id = v_org and swapcard_event_id = 'evt_test_123'));
  perform set_event_app_ref(v_oe, 'swapcard', 'ex_1');
  perform set_event_app_ref(v_oe, 'swapcard', 'ex_2', '{"source": "test"}'::jsonb);
  insert into t_res values ('05_ref_upsert', (select count(*)::text || ' id=' || max(external_id) from external_ref where system = 'swapcard' and object_type = 'exhibitor' and object_id = v_oe)
                                              || ' export_ref=' || (select coalesce(swapcard_exhibitor_id, 'null') from event_app_exhibitors(v_ed) where org_id = v_org));
  begin
    perform set_event_app_ref(v_oe, 'conferras', 'x');
    insert into t_res values ('06_invalid_system', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('06_invalid_system', 'rejected ' || sqlstate || ' ' || sqlerrm); end;
  -- Partner ohne Team-Rolle
  delete from role_assignment where person_id = v_pid and role = 'area_lead_partner';
  begin
    perform event_app_exhibitors(v_ed);
    insert into t_res values ('07_partner_export', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('07_partner_export', 'rejected ' || sqlstate); end;
  begin
    perform set_event_app_ref(v_oe, 'swapcard', 'ex_3');
    insert into t_res values ('08_partner_ref', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('08_partner_ref', 'rejected ' || sqlstate); end;
  begin
    perform set_edition_swapcard(v_ed, 'evt_x');
    insert into t_res values ('09_partner_edition', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('09_partner_edition', 'rejected ' || sqlstate); end;
end $$;
select * from t_res order by step;
rollback;

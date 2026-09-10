-- Smoke-Test 0040: Partner-Org-Kontext — Kontakte anlegen/ändern/entfernen mit genau einem Hauptkontakt, Rollenrechte, my_partner_orgs, partner_overview, Onboarding-Pflege, Team-Übersicht.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_org uuid; v_oe uuid; v_p1 uuid; v_p2 uuid; v_json jsonb;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary where p.auth_user_id is not null limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  delete from role_assignment where person_id = v_pid; delete from staff_user where auth_user_id = v_uid; -- Testperson ohne Vorrechte (Rollback stellt alles wieder her)
  select id into v_ed from event where is_edition and slug = 'fls27';
  -- Org + Edition + Leistung (als Partner-Team)
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  insert into organization (legal_name, communication_name, type) values ('Test Partner GmbH', 'TestPartner', 'partner') returning id into v_org;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited') returning id into v_oe;
  insert into org_product (org_edition_id, product_sku, qty, unit_price_cents) values (v_oe, 'I-50131', 1, 1190000);

  v_p1 := upsert_partner_contact(v_org, ' Prima.Ops@Example.com ', 'Prima', 'Ops', '{primary_ops}', 'Head of Events');
  insert into t_res values ('01_primary_created', (select roles::text || ' pos=' || coalesce(contact_position, '-') from org_membership where org_id = v_org and person_id = v_p1)
                                                    || ' role=' || (select count(*)::text from role_assignment where person_id = v_p1 and role = 'partner_contact' and scope_type = 'org' and scope_id = v_org)
                                                    || ' mail=' || (select count(*)::text from mail_log where template_key = 'partner_contact_invite' and person_id = v_p1)
                                                    || ' email_norm=' || (select (pe.email::text = 'prima.ops@example.com')::text from person_email pe where pe.person_id = v_p1 and pe.is_primary));
  begin
    perform upsert_partner_contact(v_org, 'second@example.com', 'Sec', 'Ond', '{primary_ops}');
    insert into t_res values ('02_second_primary', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('02_second_primary', 'rejected ' || sqlerrm); end;
  v_p2 := upsert_partner_contact(v_org, 'add@example.com', 'Addi', 'Tional', '{additional,event_app_member}');
  begin
    perform upsert_partner_contact(v_org, 'x@example.com', 'X', 'Y', '{boss}');
    insert into t_res values ('03_invalid_role', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('03_invalid_role', 'rejected ' || sqlerrm); end;
  insert into t_res values ('04_contacts', (select count(*)::text from partner_contacts(v_org)) || ' first_is_primary=' || (select ('primary_ops' = any(roles))::text from partner_contacts(v_org) limit 1));
  begin
    perform set_contact_roles(v_org, v_p1, '{additional}');
    insert into t_res values ('05_strip_primary', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('05_strip_primary', 'rejected ' || sqlerrm); end;
  perform transfer_primary_contact(v_org, v_p2);
  insert into t_res values ('06_transfer', (select roles::text from org_membership where org_id = v_org and person_id = v_p2) || ' | ' || (select roles::text from org_membership where org_id = v_org and person_id = v_p1));
  perform remove_partner_contact(v_org, v_p1);
  insert into t_res values ('07_removed', (select count(*)::text from org_membership where org_id = v_org and person_id = v_p1) || ' roles=' || (select count(*)::text from role_assignment where person_id = v_p1 and role = 'partner_contact'));
  begin
    perform remove_partner_contact(v_org, v_p2);
    insert into t_res values ('08_remove_primary', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('08_remove_primary', 'rejected ' || sqlerrm); end;

  -- Testperson wird selbst Mitglied (additional), Team-Rolle weg ⇒ Partner-Sicht
  perform upsert_partner_contact(v_org, v_email, 'Test', 'Person', '{additional}');
  delete from role_assignment where person_id = v_pid and role = 'area_lead_partner';
  insert into t_res values ('09_my_orgs', (select count(*)::text || ' roles=' || max(roles::text) || ' status=' || max(onboarding_status) || ' slug=' || max(edition_slug) from my_partner_orgs()));
  v_json := partner_overview(v_org);
  insert into t_res values ('10_overview', 'products=' || jsonb_array_length(v_json->'products')::text || ' sku=' || (v_json->'products'->0->>'sku') || ' price_visible=' || ((v_json->'products'->0->>'unit_price_cents') is not null)::text
                                            || ' deadlines=' || jsonb_array_length(v_json->'deadlines')::text || ' team=' || (v_json->>'team') || ' contacts=' || (v_json->>'contacts_count'));
  begin
    perform upsert_partner_contact(v_org, 'new@example.com', 'New', 'One', '{additional}');
    insert into t_res values ('11_additional_cannot_manage', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('11_additional_cannot_manage', 'rejected ' || sqlstate); end;
  v_json := update_partner_onboarding(v_org, jsonb_build_object('address_street', 'Straße 1', 'address_zip', '20095', 'address_city', 'Hamburg', 'address_country', 'DE',
                                                                 'invoice_email', 'Rechnung@Example.com', 'description_de', 'Wir machen Dinge.', 'pass_type_choice', 'startup'));
  insert into t_res values ('12_onboarding_filled', (v_json->>'onboarding_status') || ' invoice=' || (select invoice_email::text from org_edition where id = v_oe) || ' pass=' || (select pass_type_choice from org_edition where id = v_oe));
  begin
    perform update_partner_onboarding(v_org, jsonb_build_object('pass_type_choice', 'speaker'));
    insert into t_res values ('13_invalid_pass_type', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('13_invalid_pass_type', 'rejected ' || sqlerrm); end;
  begin
    perform partner_overview(gen_random_uuid());
    insert into t_res values ('14_foreign_org', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('14_foreign_org', 'rejected ' || sqlstate); end;
  insert into t_res values ('15_col_privileges', 'notes_hidden=' || (not has_column_privilege('authenticated', 'public.org_edition', 'notes_internal', 'select'))::text
                                                   || ' invoice_ok=' || has_column_privilege('authenticated', 'public.org_edition', 'invoice_email', 'select')::text
                                                   || ' membership_insert=' || has_table_privilege('authenticated', 'public.org_membership', 'insert')::text
                                                   || ' org_update=' || has_table_privilege('authenticated', 'public.organization', 'update')::text);
  -- Team-Sicht
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  insert into t_res values ('16_admin_overview', (select count(*)::text || ' contacts=' || max(contacts)::text || ' products=' || max(products)::text || ' status=' || max(onboarding_status) from partner_admin_overview(v_ed) where org_id = v_org));
  perform partner_set_onboarding_status(v_org, 'call_done');
  insert into t_res values ('17_status', (select onboarding_status from org_edition where id = v_oe));
  insert into t_res values ('18_audit', (select string_agg(action || '=' || n::text, ', ' order by action) from (select action, count(*) n from audit_log where action like 'partner.%' and created_at >= now() group by action) s));
end $$;
select * from t_res order by step;
rollback;

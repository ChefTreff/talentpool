-- Smoke-Test 0056: upsert_deliverable_template zieht bestehende Organisationen laufender Editionen sofort nach (neue globale Pflicht erscheint ohne
-- manuellen Resync; Audit nennt die Zahl der synchronisierten org_editions); SKU-Pflicht erscheint nur bei passender Buchung; Partner ohne Team-Rolle 42501.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_org uuid; v_org2 uuid; v_oe uuid; v_oe2 uuid; v_tpl uuid; v_tpl2 uuid;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid; delete from staff_user where auth_user_id = v_uid;
  select id into v_ed from event where is_edition and slug = 'fls27';
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  insert into organization (legal_name, communication_name, type) values ('Vorher GmbH', 'Vorher', 'corporate') returning id into v_org;
  insert into organization (legal_name, communication_name, type) values ('Ohne Stand GmbH', 'Ohne Stand', 'corporate') returning id into v_org2;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited') returning id into v_oe;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org2, v_ed, 'invited') returning id into v_oe2;
  insert into org_product (org_edition_id, product_sku, qty, unit_price_cents) values (v_oe, 'I-50131', 1, 1190000);
  insert into t_res values ('01_before', (select count(*)::text from deliverable where org_edition_id in (v_oe, v_oe2) and key = 'test_resync_global'));
  v_tpl := upsert_deliverable_template(jsonb_build_object('key', 'test_resync_global', 'type', 'info', 'label_de', 'Neue Pflicht', 'label_en', 'New task', 'sort', 97));
  insert into t_res values ('02_global_appears', (select count(*)::text || ' status=' || string_agg(distinct status, ',') from deliverable where org_edition_id in (v_oe, v_oe2) and key = 'test_resync_global'));
  insert into t_res values ('03_audit_synced', (select coalesce(max(after->>'resynced_org_editions'), '-') from audit_log where action = 'partner.template' and object_id = v_tpl::text));
  v_tpl2 := upsert_deliverable_template(jsonb_build_object('key', 'test_resync_sku', 'type', 'info', 'label_de', 'Stand-Pflicht', 'label_en', 'Booth task', 'product_sku', 'I-50131', 'sort', 96));
  insert into t_res values ('04_sku_only_booked', (select string_agg(o.communication_name || ':' || d.status, ',' order by o.communication_name)
                                                     from deliverable d join org_edition oe on oe.id = d.org_edition_id join organization o on o.id = oe.org_id
                                                     where d.key = 'test_resync_sku' and oe.id in (v_oe, v_oe2)));
  perform upsert_deliverable_template(jsonb_build_object('id', v_tpl, 'label_de', 'Neue Pflicht (umbenannt)'));
  insert into t_res values ('05_update_keeps', (select count(*)::text from deliverable where org_edition_id in (v_oe, v_oe2) and key = 'test_resync_global'));
  delete from role_assignment where person_id = v_pid and role = 'area_lead_partner';
  begin
    perform upsert_deliverable_template(jsonb_build_object('key', 'x', 'type', 'info', 'label_de', 'x', 'label_en', 'x'));
    insert into t_res values ('06_partner_template', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('06_partner_template', 'rejected ' || sqlstate); end;
end $$;
select * from t_res order by step;
rollback;

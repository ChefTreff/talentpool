-- Smoke-Test 0057/0058: Rolle aus Produkt (I-79895 ⇒ standbuehne_editor für den Hauptkontakt, Scope org, bis Editionsende, note auto:product; Übergabe des
-- Hauptkontakts verschiebt sie, Storno entzieht sie, erneute Buchung vergibt sie, manuelle Rollen bleiben); set_edition_hubspot mit Erfolgs-Phase;
-- Logo-Pflichten: logo_vector nur SVG (EPS ⇒ 22023 file_rules), onboarding filled erst mit SVG und PNG; upsert_session als reiner Bühnen-Editor:
-- Gastgeberin = eigene Org, fremde Org ⇒ 42501 host_org_required (Anlegen und Ändern), Titel ändern bleibt möglich.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_event uuid; v_org uuid; v_org2 uuid; v_oe uuid; v_other uuid; v_op uuid; v_sess uuid; v_path text; v_png text; v_detail text; v_end date;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email from person p join person_email pe on pe.person_id = p.id and pe.is_primary where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid; delete from staff_user where auth_user_id = v_uid; -- Testperson ohne Vorrechte (Rollback stellt alles wieder her)
  select id, end_date into v_ed, v_end from event where is_edition and slug = 'fls27';
  select e.id into v_event from event e where e.edition_id = v_ed and not e.is_edition and exists (select 1 from stage s where s.event_id = e.id) limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  insert into organization (legal_name, communication_name, type) values ('Bühne GmbH', 'Bühne', 'corporate') returning id into v_org;
  insert into organization (legal_name, communication_name, type) values ('Fremd GmbH', 'Fremd', 'corporate') returning id into v_org2;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited') returning id into v_oe;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org2, v_ed, 'invited');
  perform upsert_partner_contact(v_org, v_email, 'Test', 'Person', '{primary_ops}');
  v_other := upsert_partner_contact(v_org, 'zweite.person@example.com', 'Zweite', 'Person', '{additional}');
  insert into t_res values ('01_before', (select count(*)::text from role_assignment where role = 'standbuehne_editor' and scope_type = 'org' and scope_id = v_org));
  insert into org_product (org_edition_id, product_sku, qty, unit_price_cents) values (v_oe, 'I-79895', 1, 0) returning id into v_op;
  insert into t_res values ('02_granted', (select count(*)::text || ' primary=' || bool_or(person_id = v_pid)::text || ' other=' || bool_or(person_id = v_other)::text
                                             || ' note=' || max(note) || ' edition_ok=' || bool_and(edition_id = v_ed)::text || ' valid_to_ok=' || bool_and(valid_to = (v_end + 1)::timestamptz)::text
                                             from role_assignment where role = 'standbuehne_editor' and scope_type = 'org' and scope_id = v_org and (valid_to is null or valid_to > now())));
  perform transfer_primary_contact(v_org, v_other);
  insert into t_res values ('03_transfer', 'old_active=' || (select count(*) from role_assignment where person_id = v_pid and role = 'standbuehne_editor' and scope_id = v_org and (valid_to is null or valid_to > now()))::text
                                          || ' new_active=' || (select count(*) from role_assignment where person_id = v_other and role = 'standbuehne_editor' and scope_id = v_org and (valid_to is null or valid_to > now()))::text);
  perform transfer_primary_contact(v_org, v_pid);
  update org_product set status = 'cancelled' where id = v_op;
  insert into t_res values ('04_cancelled', (select count(*)::text from role_assignment where role = 'standbuehne_editor' and scope_id = v_org and (valid_to is null or valid_to > now())));
  update org_product set status = 'booked' where id = v_op;
  insert into role_assignment (person_id, role, scope_type, scope_id, edition_id) values (v_other, 'standbuehne_editor', 'org', v_org, v_ed); -- manuell durch das Team (note leer)
  update org_product set status = 'cancelled' where id = v_op;
  insert into t_res values ('05_manual_stays', 'primary_active=' || (select count(*) from role_assignment where person_id = v_pid and role = 'standbuehne_editor' and scope_id = v_org and (valid_to is null or valid_to > now()))::text
                                               || ' manual_active=' || (select count(*) from role_assignment where person_id = v_other and role = 'standbuehne_editor' and scope_id = v_org and (valid_to is null or valid_to > now()))::text);
  update org_product set status = 'booked' where id = v_op;
  perform set_edition_hubspot(v_ed, 'pipe_1', 'stage_1', 'stage_done');
  insert into t_res values ('06_hubspot_done', (select pipeline_id || '/' || stage_id || '/' || coalesce(done_stage_id, '-') from hubspot_editions() where edition_id = v_ed));
  -- Logo-Pflichten (0057)
  update organization set address_street = 'Weg 1', address_zip = '20095', address_city = 'Hamburg' where id = v_org;
  update org_edition set invoice_email = 'rechnung@example.com', description_de = 'Wir.' where id = v_oe;
  insert into t_res values ('06b_vocab_foundation', (select 'foundation=' || is_vocab_key('organization_type', 'foundation')::text || ' initiative=' || is_vocab_key('organization_type', 'initiative')::text));
  insert into t_res values ('07_templates', (select string_agg(key || ':' || (file_rules->>'ext'), ' ' order by key) from deliverable_template where key in ('logo_vector', 'logo_png')));
  v_path := v_ed::text || '/' || v_org::text || '/logo_vector/logo.eps';
  insert into storage.objects (bucket_id, name) values ('partner-assets', v_path);
  begin
    perform register_partner_asset(v_org, 'logo_vector', v_path, 'logo.eps', 'application/postscript', 100, (select id from deliverable where org_edition_id = v_oe and key = 'logo_vector'));
    insert into t_res values ('08_eps_rejected', 'ALLOWED (BUG)');
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    insert into t_res values ('08_eps_rejected', 'rejected ' || sqlstate || ' ' || sqlerrm || ' ' || coalesce(v_detail, ''));
  end;
  v_path := v_ed::text || '/' || v_org::text || '/logo_vector/logo.svg';
  insert into storage.objects (bucket_id, name) values ('partner-assets', v_path);
  perform register_partner_asset(v_org, 'logo_vector', v_path, 'logo.svg', 'image/svg+xml', 100, (select id from deliverable where org_edition_id = v_oe and key = 'logo_vector'));
  insert into t_res values ('09_svg_only', coalesce(partner_onboarding_recheck(v_oe), 'null'));
  v_png := v_ed::text || '/' || v_org::text || '/logo_png/logo.png';
  insert into storage.objects (bucket_id, name) values ('partner-assets', v_png);
  perform register_partner_asset(v_org, 'logo_png', v_png, 'logo.png', 'image/png', 2048, (select id from deliverable where org_edition_id = v_oe and key = 'logo_png'));
  insert into t_res values ('10_both_filled', coalesce(partner_onboarding_recheck(v_oe), 'null'));
  -- Session als reiner Bühnen-Editor (Team-Rolle weg, Rolle aus dem Produkt bleibt)
  delete from role_assignment where person_id = v_pid and role = 'area_lead_partner';
  v_sess := upsert_session(jsonb_build_object('event_id', v_event, 'title_de', 'Standbühnen-Talk'));
  insert into t_res values ('11_session_host', (select (host_org_id = v_org)::text from session where id = v_sess));
  begin
    perform upsert_session(jsonb_build_object('event_id', v_event, 'title_de', 'Fremd', 'host_org_id', v_org2));
    insert into t_res values ('12_foreign_host', 'ALLOWED (BUG)');
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    insert into t_res values ('12_foreign_host', 'rejected ' || sqlstate || ' ' || coalesce(v_detail, ''));
  end;
  begin
    perform upsert_session(jsonb_build_object('id', v_sess, 'host_org_id', v_org2));
    insert into t_res values ('13_update_foreign', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('13_update_foreign', 'rejected ' || sqlstate); end;
  perform upsert_session(jsonb_build_object('id', v_sess, 'title_de', 'Standbühnen-Talk (neu)'));
  insert into t_res values ('14_update_title', (select title_de || ' host_ok=' || (host_org_id = v_org)::text from session where id = v_sess));
end $$;
select * from t_res order by step;
rollback;

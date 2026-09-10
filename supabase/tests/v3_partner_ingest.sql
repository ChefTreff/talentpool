-- Smoke-Test 0043/0044: HubSpot-Ingest — nur service_role (authenticated 42501), Edition ↔ Pipeline nur Team, Gate (Fehlerliste, sync_error, Mail an Owner bzw. Fallback,
-- keine Teilschreibungen), Erfolg (Org, org_edition invited mit Rechnungs-E-Mail aus Accounting-Kontakt, Leistungen, Ticket-Kontingent, Checkliste, Kontakte mit Rolle bis
-- Editionsende, Bühnen-Editor Scope org, Einladungen), Idempotenz, zweiter Deal derselben Firma (primary_conflict / Ergänzung), Webhook-Duplikat, Sync-Job, Team-Log,
-- can_edit_stage über stage.partner_org_id, upsert_partner_contact im Portal setzt valid_to.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_json jsonb; v_org uuid; v_oe uuid; v_deal jsonb; v_ok jsonb; v_we jsonb; v_job bigint;
        v_stage uuid; v_stage2 uuid; v_event uuid; v_stage_type text; v_err bigint;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid; delete from staff_user where auth_user_id = v_uid; -- Testperson ohne Vorrechte (Rollback stellt alles wieder her)
  select id into v_ed from event where is_edition and slug = 'fls27';

  -- Nutzer-Sicht: Ingest und Edition-Zuordnung sind nicht erlaubt
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  begin
    perform ingest_partner_deal('{"deal": {"id": "x"}}'::jsonb);
    insert into t_res values ('01_user_ingest', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('01_user_ingest', 'rejected ' || sqlstate); end;
  begin
    perform set_edition_hubspot(v_ed, 'pipe-test', 'stage-test');
    insert into t_res values ('02_user_set_edition', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('02_user_set_edition', 'rejected ' || sqlstate); end;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  perform set_edition_hubspot(v_ed, 'pipe-test', 'stage-test');
  insert into t_res values ('03_edition_set', (select pipeline_id || '/' || stage_id from hubspot_editions() where edition_id = v_ed));
  delete from role_assignment where person_id = v_pid;
  perform set_config('request.jwt.claims', '', true); -- ab hier service_role-Sicht (keine Claims)

  -- Gate: fehlende Rechnungs-E-Mail und Kommunikationsname, zwei Hauptkontakte, ungültige Rolle, ungültige Kontakt-E-Mail, unbekannte SKU
  v_deal := jsonb_build_object(
    'deal', jsonb_build_object('id', 'deal-fail-1', 'name', 'FLS27 Fail GmbH', 'pipeline', 'pipe-test', 'stage', 'stage-test', 'url', 'https://app.hubspot.com/x', 'owner_email', v_email),
    'company', jsonb_build_object('id', 'co-fail', 'legal_name', 'Fail GmbH', 'street', 'Weg 1', 'zip', '20095', 'city', 'Hamburg'),
    'contacts', jsonb_build_array(
        jsonb_build_object('id', 'c1', 'email', 'p1@example.com', 'first_name', 'A', 'last_name', 'B', 'roles', jsonb_build_array('primary_ops')),
        jsonb_build_object('id', 'c2', 'email', 'p2@example.com', 'first_name', 'C', 'last_name', 'D', 'roles', jsonb_build_array('primary_ops', 'boss')),
        jsonb_build_object('id', 'c3', 'email', 'not-an-email', 'first_name', 'E', 'last_name', 'F', 'roles', jsonb_build_array('additional'))),
    'line_items', jsonb_build_array(jsonb_build_object('id', 'li1', 'sku', 'I-99999', 'qty', 1)));
  v_json := ingest_partner_deal(v_deal);
  insert into t_res values ('04_gate_failed', 'ok=' || (v_json->>'ok') || ' errors=' || (select string_agg(e, ',' order by e) from jsonb_array_elements_text(v_json->'errors') e)
                                               || ' notified=' || (v_json->>'notified') || ' owner_found=' || (v_json->>'owner_found'));
  insert into t_res values ('05_gate_sideeffects', 'sync_errors=' || (select count(*)::text from integration.sync_error where object_id = 'deal-fail-1')
                                                    || ' mail_owner=' || (select count(*)::text from mail_log where template_key = 'partner_gate_failed' and person_id = v_pid)
                                                    || ' errors_in_vars=' || (select (meta->'vars'->>'errors' like '%invoice_email_missing%')::text from mail_log where template_key = 'partner_gate_failed' and person_id = v_pid limit 1)
                                                    || ' orgs=' || (select count(*)::text from organization where hubspot_id = 'co-fail')
                                                    || ' persons=' || (select count(*)::text from person_email where email in ('p1@example.com', 'p2@example.com')));
  v_json := ingest_partner_deal(jsonb_build_object('deal', jsonb_build_object('id', 'deal-fail-2', 'pipeline', 'nope'), 'company', '{}'::jsonb, 'contacts', '[]'::jsonb, 'line_items', '[]'::jsonb));
  insert into t_res values ('06_pipeline_unknown', (select string_agg(e, ',' order by e) from jsonb_array_elements_text(v_json->'errors') e) || ' notified=' || (v_json->>'notified'));

  -- Erfolg: Testperson wird Hauptkontakt, zweiter Kontakt additional+event_app, Buchhaltung ohne Login liefert die Rechnungs-E-Mail
  v_deal := jsonb_build_object(
    'deal', jsonb_build_object('id', 'deal-ok-1', 'name', 'FLS27 Erfolg GmbH', 'pipeline', 'pipe-test', 'stage', 'stage-test', 'url', 'https://app.hubspot.com/y', 'owner_email', 'owner@example.com'),
    'company', jsonb_build_object('id', 'co-ok', 'legal_name', 'Erfolg GmbH', 'communication_name', 'Erfolg', 'street', 'Weg 2', 'zip', '20095', 'city', 'Hamburg', 'country', 'DE',
                                  'website', 'https://erfolg.example', 'description', 'Wir bauen Dinge.', 'type', 'corporate', 'vat_id', 'DE123456789'),
    'contacts', jsonb_build_array(
        jsonb_build_object('id', 'c1', 'email', v_email, 'first_name', 'Test', 'last_name', 'Person', 'position', 'Head of Events', 'roles', jsonb_build_array('primary_ops')),
        jsonb_build_object('id', 'c2', 'email', 'Second@Example.com', 'first_name', 'Sec', 'last_name', 'Ond', 'roles', jsonb_build_array('additional', 'event_app_member')),
        jsonb_build_object('id', 'c3', 'email', 'Buchhaltung@Example.com', 'first_name', 'Buch', 'last_name', 'Haltung', 'roles', jsonb_build_array('accounting'))),
    'line_items', jsonb_build_array(
        jsonb_build_object('id', 'li1', 'sku', 'I-50131', 'name', 'General', 'qty', 1, 'unit_price_cents', 1190000),
        jsonb_build_object('id', 'li2', 'sku', 'I-32776', 'name', 'Tickets Partner', 'qty', 4, 'unit_price_cents', 0),
        jsonb_build_object('id', 'li3', 'sku', 'I-79895', 'name', 'Standbühne', 'qty', 1, 'unit_price_cents', 500000)));
  v_ok := ingest_partner_deal(v_deal);
  v_org := (v_ok->>'org_id')::uuid; v_oe := (v_ok->>'org_edition_id')::uuid;
  insert into t_res values ('07_ingested', 'ok=' || (v_ok->>'ok') || ' new_org=' || (v_ok->>'new_org') || ' contacts=' || (v_ok->>'contacts') || ' products=' || (v_ok->>'products')
                                            || ' allocations=' || (v_ok->>'allocations') || ' roles=' || (v_ok->>'roles') || ' deliverables=' || (v_ok->>'deliverables'));
  insert into t_res values ('08_org_edition', (select onboarding_status || ' invoice=' || coalesce(invoice_email::text, '-') || ' vat=' || coalesce(vat_id, '-') || ' deal=' || coalesce(hubspot_deal_id, '-')
                                                      || ' invited=' || (invited_at is not null)::text from org_edition where id = v_oe)
                                            || ' org_type=' || (select type from organization where id = v_org) || ' hubspot_id=' || (select hubspot_id from organization where id = v_org));
  insert into t_res values ('09_products', (select string_agg(product_sku || 'x' || qty::text || '@' || coalesce(unit_price_cents::text, '-'), ',' order by product_sku) from org_product where org_edition_id = v_oe));
  insert into t_res values ('10_allocation', (select string_agg(pass_type || '=' || quantity::text, ',') from org_ticket_allocation where org_id = v_org and event_id = v_ed));
  insert into t_res values ('11_deliverables', (select string_agg(key, ',' order by key) from deliverable where org_edition_id = v_oe and status <> 'not_required'));
  insert into t_res values ('12_contacts', (select string_agg(pe.email::text || ':' || om.roles::text, ' | ' order by pe.email) from org_membership om join person_email pe on pe.person_id = om.person_id and pe.is_primary where om.org_id = v_org)
                                            || ' accounting_login=' || (select count(*)::text from org_membership om join person_email pe on pe.person_id = om.person_id where om.org_id = v_org and pe.email = 'buchhaltung@example.com'));
  insert into t_res values ('13_roles_primary', (select string_agg(ra.role || ':' || ra.scope_type || ':' || coalesce(to_char(ra.valid_to at time zone 'Europe/Berlin', 'YYYY-MM-DD HH24:MI'), '-'), ' | ' order by ra.role)
                                                  from role_assignment ra where ra.person_id = v_pid and ra.scope_id = v_org));
  insert into t_res values ('14_mails', 'invites=' || (select count(*)::text from mail_log where template_key = 'partner_contact_invite' and related_id in (select id from org_membership where org_id = v_org))
                                         || ' source=' || (select string_agg(distinct p.source_first, ',') from person p join org_membership om on om.person_id = p.id where om.org_id = v_org and p.id <> v_pid));
  -- Idempotenz: derselbe Deal noch einmal
  v_json := ingest_partner_deal(v_deal);
  insert into t_res values ('15_idempotent', 'already=' || (v_json->>'already') || ' products=' || (select count(*)::text from org_product where org_edition_id = v_oe)
                                              || ' invites=' || (select count(*)::text from mail_log where template_key = 'partner_contact_invite' and related_id in (select id from org_membership where org_id = v_org))
                                              || ' audits=' || (select count(*)::text from audit_log where action = 'partner.ingest' and object_id = v_org::text));
  insert into t_res values ('16_deals_ingested', array_to_string(hubspot_deals_ingested(array['deal-ok-1', 'deal-fail-1', 'deal-none']), ','));
  -- Zweiter Deal derselben Firma: anderer Hauptkontakt ⇒ primary_conflict; gleicher ⇒ Nachbuchung ergänzt Leistungen, Org bleibt
  v_json := ingest_partner_deal(jsonb_set(jsonb_set(v_deal, '{deal,id}', '"deal-ok-2"'), '{contacts,0,email}', '"other@example.com"'));
  insert into t_res values ('17_primary_conflict', 'ok=' || (v_json->>'ok') || ' errors=' || (select string_agg(e, ',' order by e) from jsonb_array_elements_text(v_json->'errors') e));
  v_json := ingest_partner_deal(jsonb_set(jsonb_set(v_deal, '{deal,id}', '"deal-ok-2"'), '{line_items}', jsonb_build_array(jsonb_build_object('id', 'li9', 'sku', 'I-79520', 'name', 'Lunch', 'qty', 3, 'unit_price_cents', 3500))));
  insert into t_res values ('18_second_deal', 'ok=' || (v_json->>'ok') || ' new_org=' || (v_json->>'new_org') || ' same_oe=' || ((v_json->>'org_edition_id')::uuid = v_oe)::text
                                               || ' products=' || (select count(*)::text from org_product where org_edition_id = v_oe) || ' first_deal_kept=' || (select (hubspot_deal_id = 'deal-ok-1')::text from org_edition where id = v_oe)
                                               || ' deals=' || (select count(*)::text from partner_deal where org_edition_id = v_oe));
  -- Webhook-Ereignisse: Duplikat je Quelle × Event-ID; Sync-Job
  v_we := record_webhook_event('hubspot', 'deal.propertyChange', 'evt-1', '{"objectId": 1}'::jsonb, null, true);
  v_json := record_webhook_event('hubspot', 'deal.propertyChange', 'evt-1', '{"objectId": 1}'::jsonb, null, true);
  perform finish_webhook_event((v_we->>'id')::bigint, 'processed', null, 'org_edition', v_oe);
  insert into t_res values ('19_webhook', 'first_dup=' || (v_we->>'duplicate') || ' second_dup=' || (v_json->>'duplicate') || ' same_id=' || ((v_we->>'id') = (v_json->>'id'))::text
                                           || ' status=' || (select status || '/' || attempts::text from integration.webhook_event where id = (v_we->>'id')::bigint));
  v_job := start_sync_job('hubspot', 'in', 'deal_sweep', 'test');
  v_err := record_sync_error(v_job, 'hubspot_deal', 'deal-x', 'api_error', '{"status": 500}'::jsonb);
  perform finish_sync_job(v_job, 'partial', '{"deals": 3}'::jsonb, null);
  insert into t_res values ('20_sync_job', (select status || ' stats=' || stats::text || ' finished=' || (finished_at is not null)::text from integration.sync_job where id = v_job));
  -- Team-Sicht: Log lesen, Fehler erledigen, Deals der Org; Nutzer-Sicht: nichts davon
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  begin
    perform record_webhook_event('hubspot', 'x', 'evt-2', '{}'::jsonb);
    insert into t_res values ('21_user_record_webhook', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('21_user_record_webhook', 'rejected ' || sqlstate); end;
  begin
    perform partner_ingest_log(10);
    insert into t_res values ('22_user_log', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('22_user_log', 'rejected ' || sqlstate); end;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  insert into t_res values ('23_team_log', (select count(*)::text || ' kinds=' || string_agg(distinct kind, ',') || ' open_errors=' || count(*) filter (where kind = 'sync_error' and not resolved)::text from partner_ingest_log(50)));
  perform resolve_sync_error(v_err);
  insert into t_res values ('24_resolved', (select (resolved_at is not null)::text from integration.sync_error where id = v_err) || ' deals=' || (select string_agg(hubspot_deal_id, ',' order by hubspot_deal_id) from partner_deals(v_org)));
  delete from role_assignment where person_id = v_pid and role = 'area_lead_partner';
  -- Bühnen-Editor: Bühne mit partner_org_id = Org ⇒ editierbar, fremde Bühne nicht (Testperson ist primary_ops mit standbuehne_editor Scope org)
  select e.id into v_event from event e where e.edition_id = v_ed and not e.is_edition and exists (select 1 from stage s where s.event_id = e.id) limit 1;
  select s.type into v_stage_type from stage s where s.event_id = v_event limit 1;
  insert into stage (event_id, name, slug, type, sort_order, active, partner_org_id) values (v_event, 'Standbühne Erfolg', 'standbuehne-erfolg-test', v_stage_type, 99, true, v_org) returning id into v_stage;
  select s.id into v_stage2 from stage s where s.event_id = v_event and s.id <> v_stage limit 1;
  insert into t_res values ('25_stage_editor', 'own=' || can_edit_stage(v_stage)::text || ' foreign=' || can_edit_stage(v_stage2)::text);
  -- Portal-Kontakt (upsert_partner_contact) bekommt ebenfalls valid_to bis Editionsende
  perform upsert_partner_contact(v_org, 'third@example.com', 'Thi', 'Rd', '{additional}');
  insert into t_res values ('26_portal_contact_valid_to', (select coalesce(to_char(ra.valid_to at time zone 'Europe/Berlin', 'YYYY-MM-DD HH24:MI'), '-') from role_assignment ra join person_email pe on pe.person_id = ra.person_id where pe.email = 'third@example.com' and ra.role = 'partner_contact'));
  insert into t_res values ('27_grants', 'ingest_auth=' || has_function_privilege('authenticated', 'ingest_partner_deal(jsonb)', 'execute')::text
                                          || ' record_auth=' || has_function_privilege('authenticated', 'record_webhook_event(text,text,text,jsonb,jsonb,boolean)', 'execute')::text
                                          || ' internal_auth=' || has_function_privilege('authenticated', 'partner_contact_upsert_internal(uuid,text,text,text,text[],text,uuid,uuid,text)', 'execute')::text
                                          || ' pass_type_col=' || has_column_privilege('authenticated', 'public.product', 'pass_type', 'select')::text
                                          || ' partner_deal_select=' || has_table_privilege('authenticated', 'public.partner_deal', 'select')::text);
  insert into t_res values ('28_audit', (select string_agg(action || '=' || n::text, ', ' order by action) from (select action, count(*) n from audit_log where (action like 'partner.%' or action like 'edition.%' or action like 'integration.%') and created_at >= now() group by action) s));
end $$;
select * from t_res order by step;
rollback;

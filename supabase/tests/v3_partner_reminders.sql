-- Smoke-Test 0045: Partner-Housekeeping — Fälligkeiten folgen den Fristen, overdue setzen/aufheben, ein Digest je Org × Edition an primary_ops + additional
-- (nicht an event_app_member) mit allen fälligen/überfälligen/zurückgewiesenen Pflichten, höchstens alle 7 Tage, erledigte Pflichten nicht mehr im Digest,
-- run_application_housekeeping liefert `partner`, interne Funktionen nicht für authenticated.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_org uuid; v_oe uuid; v_json jsonb; v_p_add uuid; v_p_app uuid; v_d_back uuid; v_d_lunch uuid; v_d_logo uuid;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid; delete from staff_user where auth_user_id = v_uid; -- Testperson ohne Vorrechte (Rollback stellt alles wieder her)
  select id into v_ed from event where is_edition and slug = 'fls27';
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  -- Das Housekeeping ist nur über den Cron (service_role) erreichbar: kein EXECUTE für authenticated (Superuser im Test umgeht Grants, deshalb Privileg statt Aufruf)
  insert into t_res values ('01_user_housekeeping', 'exec_auth=' || has_function_privilege('authenticated', 'run_partner_housekeeping()', 'execute')::text);
  -- Org als Team anlegen: Stand General + Partner-Tickets ⇒ logo_vector, backdrop_print, lunch_package, ticket_codes
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  insert into organization (legal_name, communication_name, type) values ('Reminder Test GmbH', 'RemTest', 'corporate') returning id into v_org;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited') returning id into v_oe;
  insert into org_product (org_edition_id, product_sku, qty, unit_price_cents) values (v_oe, 'I-50131', 1, 1190000), (v_oe, 'I-32776', 4, 0);
  perform upsert_partner_contact(v_org, v_email, 'Test', 'Person', '{primary_ops}');
  v_p_add := upsert_partner_contact(v_org, 'add.rem@example.com', 'Addi', 'Tional', '{additional}');
  v_p_app := upsert_partner_contact(v_org, 'app.rem@example.com', 'App', 'Member', '{event_app_member}');
  delete from role_assignment where person_id = v_pid and role = 'area_lead_partner'; -- Testperson bleibt primary_ops-Kontakt
  perform set_config('request.jwt.claims', '', true); -- Cron-Sicht (service_role)
  select id into v_d_back from deliverable where org_edition_id = v_oe and key = 'backdrop_print';
  select id into v_d_lunch from deliverable where org_edition_id = v_oe and key = 'lunch_package';
  select id into v_d_logo from deliverable where org_edition_id = v_oe and key = 'logo_vector';
  -- Fristen verschieben: Rückwand gestern (überfällig), Lunch-Paket in 2 Tagen (im Vorlauf von 7 Tagen), Ticket-Codes bleiben 2027
  update deadline set due_at = now() - interval '1 day' where edition_id = v_ed and key = 'booth_backdrop';
  update deadline set due_at = now() + interval '2 days' where edition_id = v_ed and key = 'lunch_package';
  v_json := run_partner_housekeeping();
  insert into t_res values ('02_run1', 'refreshed=' || (v_json->>'refreshed') || ' overdue=' || (v_json->>'overdue') || ' digests=' || (v_json->>'digests'));
  insert into t_res values ('03_statuses', (select string_agg(key || ':' || status, ',' order by key) from deliverable where org_edition_id = v_oe));
  insert into t_res values ('04_digest_mails', 'mails=' || (select count(*)::text from mail_log where template_key = 'partner_reminder_digest' and related_id = v_oe)
                                                || ' to_primary=' || (select count(*)::text from mail_log where template_key = 'partner_reminder_digest' and related_id = v_oe and person_id = v_pid)
                                                || ' to_additional=' || (select count(*)::text from mail_log where template_key = 'partner_reminder_digest' and related_id = v_oe and person_id = v_p_add)
                                                || ' to_app_member=' || (select count(*)::text from mail_log where template_key = 'partner_reminder_digest' and related_id = v_oe and person_id = v_p_app));
  insert into t_res values ('05_digest_content', (select 'count=' || (meta->'vars'->>'count') || ' lines=' || (array_length(string_to_array(meta->'vars'->>'items', E'\n'), 1))::text
                                                          || ' backdrop=' || ((meta->'vars'->>'items') like '%Rückwand%')::text || ' lunch=' || ((meta->'vars'->>'items') like '%Lunch%')::text
                                                          || ' tickets=' || ((meta->'vars'->>'items') like '%Ticket%')::text || ' overdue_word=' || ((meta->'vars'->>'items') like '%überfällig%')::text
                                                   from mail_log where template_key = 'partner_reminder_digest' and related_id = v_oe and person_id = v_p_add));
  -- Zweiter Lauf direkt danach: kein neuer Digest
  v_json := run_partner_housekeeping();
  insert into t_res values ('06_run2_no_repeat', 'digests=' || (v_json->>'digests') || ' mails=' || (select count(*)::text from mail_log where template_key = 'partner_reminder_digest' and related_id = v_oe));
  -- Eine Woche später: Rückwand inzwischen angenommen ⇒ Digest nur noch mit dem Lunch-Paket
  update mail_log set queued_at = now() - interval '8 days', status = 'sent' where template_key = 'partner_reminder_digest' and related_id = v_oe; -- Woche vorbei, Mails sind raus
  update deliverable set status = 'accepted' where id = v_d_back;
  v_json := run_partner_housekeeping();
  insert into t_res values ('07_run3_after_week', 'digests=' || (v_json->>'digests') || ' mails=' || (select count(*)::text from mail_log where template_key = 'partner_reminder_digest' and related_id = v_oe)
                                                    || ' latest_count=' || (select meta->'vars'->>'count' from mail_log where template_key = 'partner_reminder_digest' and related_id = v_oe and person_id = v_p_add order by id desc limit 1)
                                                    || ' latest_has_backdrop=' || (select ((meta->'vars'->>'items') like '%Rückwand%')::text from mail_log where template_key = 'partner_reminder_digest' and related_id = v_oe and person_id = v_p_add order by id desc limit 1));
  -- Zurückgewiesene Pflicht ohne Frist (Logo) landet im Digest
  update mail_log set queued_at = now() - interval '8 days', status = 'sent' where template_key = 'partner_reminder_digest' and related_id = v_oe;
  update deliverable set status = 'rejected', review_note = 'x' where id = v_d_logo;
  v_json := run_partner_housekeeping();
  insert into t_res values ('08_rejected_in_digest', 'digests=' || (v_json->>'digests') || ' mails=' || (select count(*)::text from mail_log where template_key = 'partner_reminder_digest' and related_id = v_oe)
                                                      || ' logo=' || (select ((meta->'vars'->>'items') like '%Logo%zurückgewiesen%')::text from mail_log where template_key = 'partner_reminder_digest' and related_id = v_oe and person_id = v_p_add order by id desc limit 1));
  -- overdue folgt der Frist: Lunch in die Vergangenheit ⇒ overdue, zurück in die Zukunft ⇒ open
  update deadline set due_at = now() - interval '1 hour' where edition_id = v_ed and key = 'lunch_package';
  v_json := run_partner_housekeeping();
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true); -- Partner-Sicht für partner_overview
  insert into t_res values ('09_lunch_overdue', (select status from deliverable where id = v_d_lunch) || ' overview_overdue=' || (partner_overview(v_org)->'checklist'->>'overdue'));
  perform set_config('request.jwt.claims', '', true);
  update deadline set due_at = '2027-04-09 21:59+00' where edition_id = v_ed and key = 'lunch_package';
  v_json := run_partner_housekeeping();
  insert into t_res values ('10_lunch_reopened', (select status || ' due=' || to_char(due_at at time zone 'Europe/Berlin', 'DD.MM.YYYY') from deliverable where id = v_d_lunch) || ' overdue_count=' || (v_json->>'overdue'));
  -- Einstieg über das Cron-Housekeeping
  v_json := run_application_housekeeping();
  insert into t_res values ('11_cron_entry', 'keys=' || (select string_agg(k, ',' order by k) from jsonb_object_keys(v_json) k) || ' partner_keys=' || (select string_agg(k, ',' order by k) from jsonb_object_keys(v_json->'partner') k));
  insert into t_res values ('12_grants', 'send_auth=' || has_function_privilege('authenticated', 'send_partner_reminders()', 'execute')::text
                                          || ' items_auth=' || has_function_privilege('authenticated', 'partner_digest_items(uuid)', 'execute')::text
                                          || ' housekeeping_auth=' || has_function_privilege('authenticated', 'run_application_housekeeping()', 'execute')::text);
  insert into t_res values ('13_audit', (select string_agg(action || '=' || n::text, ', ' order by action) from (select action, count(*) n from audit_log where action like 'partner.%' and created_at >= now() group by action) s));
end $$;
select * from t_res order by step;
rollback;

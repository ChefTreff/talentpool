-- Smoke-Test v6_entscheidungsmails_verzoegert (Vorschlag, PART-146): Warteliste und Absage gehen wie die Zusage nach zehn Minuten raus, jede Änderung der
-- Entscheidung im Fenster stoppt die wartende Mail. Setzt `v6_mail_verzoegert` (0276) und `v6_zusage_mail_verzoegert` (0280) voraus; läuft mit
-- `db.sh dry-run <migration> <test>`. Echter Rollenwechsel: Entscheidungen als Hauptkontakt der Partner-Organisation (`set local role authenticated`),
-- Freigabe und Sammelentscheidung als Programm-Team. Jede Prüfung hat ein Gegenstück (wartet neben sofort, storniert neben bleibt, Mail neben keiner Mail);
-- „0 Treffer“ allein beweist nichts. Erwartung je Schritt als Muster in `t_erw`; `99_auswertung` am Ende. Wegwerfdaten (ZZ …), alles wird zurückgerollt.
--   01 Form. 02 Warteliste und 03 Absage warten mit `send_after = jetzt + 10 Minuten`. 04 Vor der Freigabe schickt keine der drei etwas.
--   05 Absage → Zusage im Fenster: die Absage-Mail entfällt (`decision_changed`), die Zusage-Mail wartet; die Person bekommt nur noch eine.
--   06 Zusage → Warteliste → Absage: jede Zwischenstufe entfällt, eine Mail wartet. 07 Warteliste → nachgerückt: Wartelisten-Mail entfällt, die Nachrück-Mail geht sofort.
--   08 Schon versendete Absage bleibt; die neue Zusage wartet. 09 Doppelklick ändert nichts. 10 Sammelentscheidung des Teams verzögert jede Absage.
--   11 Freigabe schickt wie bisher ohne Frist, eine Änderung danach storniert auch diese Mail. 12 Der Grund unterscheidet Zusage (`accept_revoked`) von den anderen
--   (`decision_changed`). 13 Eingangsbestätigung ohne Frist. 14 ohne Adresse kein Fehler. 15 Absage per INSERT wartet. 16 Bestätigt die Person die Zusage vor dem
--   Versand, entfällt die Mail mit eigenem Grund (`accept_confirmed`).
begin;
create temp table t_res (step text, result text) on commit drop;
create temp table t_erw (step text, muster text) on commit drop;
insert into t_erw values
  ('01_form', '^ok trigger_wartelisten_mail=true grund_decision_changed=true frist_10=true vorlagen=4 trigger=true ohne_execute=true freigabe_unveraendert=true$'),
  ('02_warteliste_wartet', '^ok zeilen=1 status=queued send_after_exakt=true bezug=true$'),
  ('03_absage_wartet', '^ok zeilen=1 status=queued send_after_exakt=true bezug=true$'),
  ('04_vor_freigabe_keine_mail', '^ok mails=0 status=declined$'),
  ('05_absage_dann_zusage', '^ok absage_storniert=true grund=decision_changed zusage_wartet=true frist=true wartend_insgesamt=1$'),
  ('06_kette', '^ok zusage=cancelled/accept_revoked warteliste=cancelled/decision_changed absage=queued wartend_insgesamt=1$'),
  ('07_nachruecken', '^ok warteliste=cancelled/decision_changed nachruecken_wartet=true nachruecken_ohne_frist=true$'),
  ('08_schon_versendet', '^ok absage=sent storniert=0 zusage_wartet=true$'),
  ('09_doppelklick', '^ok zeilen=1 wartend=1$'),
  ('10_team_sammel', '^ok entschieden=2 beide_wartend=true frist=true$'),
  ('11_freigabe_sofort', '^ok mails=1 status=queued ohne_frist=true$'),
  ('11_freigabe_aenderung', '^ok absage=cancelled/decision_changed zusage_wartet=true frist=true$'),
  ('12_gruende', '^ok warteliste_zu_zusage=decision_changed zusage_zu_absage=accept_revoked absage_zu_warteliste=decision_changed$'),
  ('13_eingang_sofort', '^ok zeilen=1 ohne_frist=true$'),
  ('14_ohne_adresse', '^ok fehler=false zeilen=0 status=waitlisted$'),
  ('15_insert_absage', '^ok wartet=true frist=true$'),
  ('16_bestaetigt', '^ok zusage=cancelled/accept_confirmed wartend=0$');

create function pg_temp.zz_person(p_nachname text, p_lang text default null, p_mail boolean default true) returns uuid language plpgsql as $$
declare v_p uuid;
begin
  insert into person (first_name, last_name, preferred_language) values ('ZZ', p_nachname, p_lang) returning id into v_p;
  if p_mail then
    insert into person_email (person_id, email, is_primary) values (v_p, 'zz-em-' || lower(replace(p_nachname, ' ', '')) || '-' || v_p::text || '@example.com', true);
  end if;
  return v_p;
end $$;

-- Zeilen der Mail-Warteschlange zu einer Bewerbung (Vorlage, optional Status).
create function pg_temp.zz_n(p_app uuid, p_key text, p_status text default null) returns integer language sql as $$
  select count(*)::integer from mail_log where related_id = p_app and template_key = p_key and (p_status is null or status = p_status)
$$;
-- Status und Stornogrund der (letzten) Zeile einer Vorlage: `cancelled/decision_changed`, `queued`, `sent` …
create function pg_temp.zz_z(p_app uuid, p_key text) returns text language sql as $$
  select coalesce((select m.status || case when m.status = 'cancelled' then '/' || (m.meta->>'cancel_reason') else '' end
                     from mail_log m where m.related_id = p_app and m.template_key = p_key order by m.id desc limit 1), 'keine')
$$;

do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_claims text;
  v_ed uuid; v_event uuid; v_org uuid; v_oe uuid;
  s_rel uuid; s_open uuid;
  p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid; p6 uuid; p7 uuid; p8 uuid; p9 uuid; p10 uuid; p11 uuid; p12 uuid; p13 uuid; p14 uuid; p15 uuid; p_noemail uuid;
  ap1 uuid; ap2 uuid; ap3 uuid; ap4 uuid; ap5 uuid; ap6 uuid; ap7 uuid; ap8 uuid; ap9 uuid; ap10 uuid; ap11 uuid; ap12 uuid; ap13 uuid; ap14 uuid; ap15 uuid; ap16 uuid;
  v_m jsonb; v_m2 jsonb; v_n integer; v_t0 timestamptz := now(); v_r1 text; v_r2 text; v_r3 text; v_fehler boolean;
begin
  -- Die handelnde Person: ein Konto aus dem Bestand, in der Transaktion ohne Vorrechte; die Partnerrolle gibt `upsert_partner_contact`.
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary where p.auth_user_id is not null limit 1;
  v_claims := json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text;
  delete from role_assignment where person_id = v_pid;
  select id into v_ed from event where is_edition and slug = 'fls27';
  select e.id into v_event from event e where e.edition_id = v_ed and not e.is_edition limit 1;

  -- Team legt die Partner-Organisation an; die handelnde Person wird Hauptkontakt.
  perform set_config('request.jwt.claims', v_claims, true);
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  insert into organization (legal_name, communication_name, type) values ('ZZ Entscheidung Host GmbH', 'ZZ Entscheidung Host', 'corporate') returning id into v_org;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited') returning id into v_oe;
  perform upsert_partner_contact(v_org, v_email, 'Test', 'Person', '{primary_ops}');
  delete from role_assignment where person_id = v_pid and role = 'area_lead_partner';
  perform set_config('request.jwt.claims', '', true);

  -- Zwei Sitzungen: freigegeben und nicht freigegeben, beide vom Host ausgerichtet.
  insert into session (event_id, format, title_de, access_mode, capacity, host_org_id, publish_status)
    values (v_event, 'masterclass', 'ZZ Entscheidung Masterclass frei', 'application', 30, v_org, 'draft') returning id into s_rel;
  insert into session (event_id, format, title_de, access_mode, capacity, host_org_id, publish_status)
    values (v_event, 'masterclass', 'ZZ Entscheidung Masterclass offen', 'application', 30, v_org, 'draft') returning id into s_open;

  p1 := pg_temp.zz_person('Entscheidung 1'); p2 := pg_temp.zz_person('Entscheidung 2'); p3 := pg_temp.zz_person('Entscheidung 3');
  p4 := pg_temp.zz_person('Entscheidung 4'); p5 := pg_temp.zz_person('Entscheidung 5'); p6 := pg_temp.zz_person('Entscheidung 6');
  p7 := pg_temp.zz_person('Entscheidung 7'); p8 := pg_temp.zz_person('Entscheidung 8'); p9 := pg_temp.zz_person('Entscheidung 9');
  p10 := pg_temp.zz_person('Entscheidung 10'); p11 := pg_temp.zz_person('Entscheidung 11'); p12 := pg_temp.zz_person('Entscheidung 12');
  p13 := pg_temp.zz_person('Entscheidung 13'); p14 := pg_temp.zz_person('Entscheidung 14'); p15 := pg_temp.zz_person('Entscheidung 15'); p_noemail := pg_temp.zz_person('Ohne Adresse', null, false);

  -- Freigabe von s_rel: noch ohne entschiedene Bewerbung, also verschickt der Freigabe-Trigger nichts.
  insert into decision_release (session_id, released_by, note) values (s_rel, v_pid, 'ZZ Test');

  -- Ausgangsstand ohne Mail: „Engere Wahl“ löst weder beim Anlegen noch nach der Freigabe eine Mail aus.
  insert into application (session_id, person_id, status, consent_share) values (s_rel, p1, 'shortlisted', true) returning id into ap1;
  insert into application (session_id, person_id, status, consent_share) values (s_rel, p2, 'shortlisted', true) returning id into ap2;
  insert into application (session_id, person_id, status, consent_share) values (s_rel, p3, 'shortlisted', true) returning id into ap3;
  insert into application (session_id, person_id, status, consent_share) values (s_rel, p4, 'shortlisted', true) returning id into ap4;
  insert into application (session_id, person_id, status, consent_share) values (s_rel, p5, 'shortlisted', true) returning id into ap5;
  insert into application (session_id, person_id, status, consent_share) values (s_rel, p6, 'shortlisted', true) returning id into ap6;
  insert into application (session_id, person_id, status, consent_share) values (s_rel, p7, 'shortlisted', true) returning id into ap7;
  insert into application (session_id, person_id, status, consent_share) values (s_rel, p8, 'shortlisted', true) returning id into ap8;
  insert into application (session_id, person_id, status, consent_share) values (s_open, p9, 'shortlisted', true) returning id into ap9;
  insert into application (session_id, person_id, status, consent_share) values (s_rel, p_noemail, 'shortlisted', true) returning id into ap10;
  insert into application (session_id, person_id, status, consent_share) values (s_rel, p10, 'shortlisted', true) returning id into ap11;
  insert into application (session_id, person_id, status, consent_share) values (s_rel, p11, 'shortlisted', true) returning id into ap12;
  insert into application (session_id, person_id, status, consent_share) values (s_rel, p12, 'shortlisted', true) returning id into ap13;

  -- === 01 Form ====================================================================================================
  insert into t_res values ('01_form',
    'ok trigger_wartelisten_mail=' || (pg_get_functiondef('application_mail_trigger'::regproc) like '%''application_waitlisted'', ''application_declined''%')::text
    || ' grund_decision_changed=' || (pg_get_functiondef('application_mail_trigger'::regproc) like '%decision_changed%')::text
    || ' frist_10=' || (pg_get_functiondef('application_mail_trigger'::regproc) like '%interval ''10 minutes''%')::text
    || ' vorlagen=' || (select count(*) from mail_template where key in ('application_waitlisted', 'application_declined') and active)::text
    || ' trigger=' || exists (select 1 from pg_trigger t where t.tgname = 'trg_application_mail' and t.tgenabled = 'O' and not t.tgisinternal)::text
    || ' ohne_execute=' || (not has_function_privilege('authenticated', 'application_mail_trigger()', 'execute')
                            and not has_function_privilege('anon', 'application_mail_trigger()', 'execute'))::text
    || ' freigabe_unveraendert=' || (pg_get_functiondef('decision_release_mail_trigger'::regproc) not like '%queue_mail_debounced%')::text);

  -- === 02/03 Warteliste und Absage als Hauptkontakt der Partner-Organisation (Sitzung freigegeben) =====================
  perform set_config('request.jwt.claims', v_claims, true);
  execute 'set local role authenticated';
  perform decide_application(ap1, 'waitlisted');
  perform decide_application(ap2, 'declined');
  execute 'reset role';
  select to_jsonb(m) into v_m from mail_log m where m.related_id = ap1 and m.template_key = 'application_waitlisted';
  insert into t_res values ('02_warteliste_wartet',
    'ok zeilen=' || pg_temp.zz_n(ap1, 'application_waitlisted')::text || ' status=' || (v_m->>'status')
    || ' send_after_exakt=' || ((v_m->>'send_after')::timestamptz = v_t0 + interval '10 minutes')::text
    || ' bezug=' || ((v_m->>'related_type') = 'application' and (v_m->>'person_id')::uuid = p1)::text);
  select to_jsonb(m) into v_m from mail_log m where m.related_id = ap2 and m.template_key = 'application_declined';
  insert into t_res values ('03_absage_wartet',
    'ok zeilen=' || pg_temp.zz_n(ap2, 'application_declined')::text || ' status=' || (v_m->>'status')
    || ' send_after_exakt=' || ((v_m->>'send_after')::timestamptz = v_t0 + interval '10 minutes')::text
    || ' bezug=' || ((v_m->>'related_type') = 'application' and (v_m->>'person_id')::uuid = p2)::text);

  -- === 04 Vor der Freigabe schickt keine Entscheidung etwas ===========================================================
  execute 'set local role authenticated';
  perform decide_application(ap9, 'declined');
  execute 'reset role';
  insert into t_res values ('04_vor_freigabe_keine_mail',
    'ok mails=' || (select count(*) from mail_log where related_id = ap9)::text || ' status=' || (select status from application where id = ap9));

  -- === 05 Absage, dann doch Zusage im Fenster =========================================================================
  execute 'set local role authenticated';
  perform decide_application(ap3, 'declined');
  perform decide_application(ap3, 'accepted');
  execute 'reset role';
  insert into t_res values ('05_absage_dann_zusage',
    'ok absage_storniert=' || (pg_temp.zz_z(ap3, 'application_declined') = 'cancelled/decision_changed')::text
    || ' grund=' || coalesce((select m.meta->>'cancel_reason' from mail_log m where m.related_id = ap3 and m.template_key = 'application_declined'), '-')
    || ' zusage_wartet=' || (pg_temp.zz_n(ap3, 'application_accepted', 'queued') = 1)::text
    || ' frist=' || ((select send_after from mail_log where related_id = ap3 and template_key = 'application_accepted' and status = 'queued') = v_t0 + interval '10 minutes')::text
    || ' wartend_insgesamt=' || (select count(*) from mail_log where related_id = ap3 and status = 'queued')::text);

  -- === 06 Kette: Zusage → Warteliste → Absage =========================================================================
  execute 'set local role authenticated';
  perform decide_application(ap4, 'accepted');
  perform decide_application(ap4, 'waitlisted');
  perform decide_application(ap4, 'declined');
  execute 'reset role';
  insert into t_res values ('06_kette',
    'ok zusage=' || pg_temp.zz_z(ap4, 'application_accepted') || ' warteliste=' || pg_temp.zz_z(ap4, 'application_waitlisted')
    || ' absage=' || pg_temp.zz_z(ap4, 'application_declined')
    || ' wartend_insgesamt=' || (select count(*) from mail_log where related_id = ap4 and status = 'queued')::text);

  -- === 07 Warteliste → nachgerückt (das System stellt den Stand um) ===================================================
  execute 'set local role authenticated';
  perform decide_application(ap5, 'waitlisted');
  execute 'reset role';
  update application set status = 'promoted' where id = ap5;
  select to_jsonb(m) into v_m from mail_log m where m.related_id = ap5 and m.template_key = 'application_promoted';
  insert into t_res values ('07_nachruecken',
    'ok warteliste=' || pg_temp.zz_z(ap5, 'application_waitlisted')
    || ' nachruecken_wartet=' || ((v_m->>'status') = 'queued')::text || ' nachruecken_ohne_frist=' || ((v_m->>'send_after') is null)::text);

  -- === 08 Eine schon versendete Absage lässt sich nicht zurückholen ===================================================
  execute 'set local role authenticated';
  perform decide_application(ap6, 'declined');
  execute 'reset role';
  update mail_log set status = 'sent', sent_at = now() where related_id = ap6 and template_key = 'application_declined';
  execute 'set local role authenticated';
  perform decide_application(ap6, 'accepted');
  execute 'reset role';
  insert into t_res values ('08_schon_versendet',
    'ok absage=' || pg_temp.zz_z(ap6, 'application_declined') || ' storniert=' || pg_temp.zz_n(ap6, 'application_declined', 'cancelled')::text
    || ' zusage_wartet=' || (pg_temp.zz_n(ap6, 'application_accepted', 'queued') = 1)::text);

  -- === 09 Doppelklick: dieselbe Entscheidung noch einmal ändert nichts ==============================================
  execute 'set local role authenticated';
  perform decide_application(ap7, 'waitlisted');
  perform decide_application(ap7, 'waitlisted');
  execute 'reset role';
  insert into t_res values ('09_doppelklick',
    'ok zeilen=' || pg_temp.zz_n(ap7, 'application_waitlisted')::text || ' wartend=' || pg_temp.zz_n(ap7, 'application_waitlisted', 'queued')::text);

  -- === 10 Sammelentscheidung des Teams ================================================================================
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'programme_team', 'global');
  execute 'set local role authenticated';
  select count(*) filter (where ok) into v_n from decide_applications(array[ap8, ap11], 'declined');
  execute 'reset role';
  insert into t_res values ('10_team_sammel',
    'ok entschieden=' || v_n::text
    || ' beide_wartend=' || (pg_temp.zz_n(ap8, 'application_declined', 'queued') = 1 and pg_temp.zz_n(ap11, 'application_declined', 'queued') = 1)::text
    || ' frist=' || (select bool_and(send_after = v_t0 + interval '10 minutes') from mail_log where related_id in (ap8, ap11) and template_key = 'application_declined')::text);

  -- === 11 Freigabe: wie bisher ohne Frist; eine Änderung danach storniert auch diese Mail ===========================
  execute 'set local role authenticated';
  perform release_decisions(s_open, null);
  execute 'reset role';
  select to_jsonb(m) into v_m from mail_log m where m.related_id = ap9 and m.template_key = 'application_declined';
  insert into t_res values ('11_freigabe_sofort',
    'ok mails=' || pg_temp.zz_n(ap9, 'application_declined')::text || ' status=' || (v_m->>'status') || ' ohne_frist=' || ((v_m->>'send_after') is null)::text);
  delete from role_assignment where person_id = v_pid and role = 'programme_team';
  execute 'set local role authenticated';
  perform decide_application(ap9, 'accepted');
  execute 'reset role';
  insert into t_res values ('11_freigabe_aenderung',
    'ok absage=' || pg_temp.zz_z(ap9, 'application_declined') || ' zusage_wartet=' || (pg_temp.zz_n(ap9, 'application_accepted', 'queued') = 1)::text
    || ' frist=' || ((select send_after from mail_log where related_id = ap9 and template_key = 'application_accepted' and status = 'queued') = v_t0 + interval '10 minutes')::text);

  -- === 12 Der Grund unterscheidet Zusage von den anderen ===============================================================
  execute 'set local role authenticated';
  perform decide_application(ap12, 'waitlisted');
  perform decide_application(ap12, 'accepted');
  perform decide_application(ap12, 'declined');
  perform decide_application(ap12, 'waitlisted');
  execute 'reset role';
  insert into t_res values ('12_gruende',
    'ok warteliste_zu_zusage=' || coalesce((select m.meta->>'cancel_reason' from mail_log m where m.related_id = ap12 and m.template_key = 'application_waitlisted' and m.status = 'cancelled' order by m.id limit 1), '-')
    || ' zusage_zu_absage=' || coalesce((select m.meta->>'cancel_reason' from mail_log m where m.related_id = ap12 and m.template_key = 'application_accepted' and m.status = 'cancelled' order by m.id limit 1), '-')
    || ' absage_zu_warteliste=' || coalesce((select m.meta->>'cancel_reason' from mail_log m where m.related_id = ap12 and m.template_key = 'application_declined' and m.status = 'cancelled' order by m.id limit 1), '-'));

  -- === 13 Eingangsbestätigung: INSERT `applied` geht ohne Frist ======================================================
  insert into application (session_id, person_id, status, consent_share) values (s_rel, p13, 'applied', true) returning id into ap14;
  insert into t_res values ('13_eingang_sofort',
    'ok zeilen=' || pg_temp.zz_n(ap14, 'application_received', 'queued')::text
    || ' ohne_frist=' || ((select send_after from mail_log where related_id = ap14 and template_key = 'application_received') is null)::text);

  -- === 14 Ohne E-Mail-Adresse: kein Fehler, keine Zeile ==============================================================
  v_fehler := false;
  begin
    execute 'set local role authenticated';
    perform decide_application(ap10, 'waitlisted');
    execute 'reset role';
  exception when others then v_fehler := true; execute 'reset role'; end;
  insert into t_res values ('14_ohne_adresse',
    'ok fehler=' || v_fehler::text || ' zeilen=' || (select count(*) from mail_log where related_id = ap10)::text
    || ' status=' || (select status from application where id = ap10));

  -- === 15 Absage per INSERT (Import) wartet ebenfalls ==================================================================
  insert into application (session_id, person_id, status, consent_share) values (s_rel, p14, 'declined', true) returning id into ap15;
  select to_jsonb(m) into v_m from mail_log m where m.related_id = ap15 and m.template_key = 'application_declined';
  insert into t_res values ('15_insert_absage',
    'ok wartet=' || ((v_m->>'status') = 'queued')::text || ' frist=' || ((v_m->>'send_after')::timestamptz = v_t0 + interval '10 minutes')::text);

  -- === 16 Bestätigt die Person die Zusage vor dem Versand, entfällt die Mail mit eigenem Grund ========================
  insert into application (session_id, person_id, status, consent_share) values (s_rel, p15, 'shortlisted', true) returning id into ap16;
  execute 'set local role authenticated';
  perform decide_application(ap16, 'accepted');
  execute 'reset role';
  update application set status = 'confirmed', confirmed_at = now() where id = ap16;
  insert into t_res values ('16_bestaetigt',
    'ok zusage=' || pg_temp.zz_z(ap16, 'application_accepted') || ' wartend=' || (select count(*) from mail_log where related_id = ap16 and status = 'queued')::text);
end $$;
insert into t_res
  select '99_auswertung',
         case when count(*) filter (where not z.erfuellt) = 0 then 'ok: alle ' || count(*)::text || ' Erwartungen erfüllt'
              else 'FEHLER: ' || string_agg(z.step, ', ' order by z.step) filter (where not z.erfuellt) end
    from (select e.step, exists (select 1 from t_res r where r.step = e.step and r.result ~ e.muster) as erfuellt from t_erw e) z;
select * from t_res order by step;
rollback;

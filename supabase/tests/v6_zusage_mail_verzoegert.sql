-- Smoke-Test v6_zusage_mail_verzoegert (Vorschlag, PART-124): Die Zusage-Mail wartet zehn Minuten, eine Rücknahme der Zusage stoppt sie.
-- Setzt `v6_mail_verzoegert` (0276: `queue_mail_debounced`, `cancel_queued_mail`) voraus; läuft mit `db.sh dry-run <migration> <test>`.
-- Echter Rollenwechsel: Entscheidungen als Hauptkontakt der Partner-Organisation (`set local role authenticated`, Rolle über
-- `upsert_partner_contact`), die Freigabe und die Sammelentscheidung als Programm-Team. Jede Prüfung hat ein Gegenstück (wartet neben sofort,
-- storniert neben nicht storniert, Mail neben keiner Mail); „0 Treffer“ allein beweist nichts. Erwartung je Schritt als Muster in `t_erw`,
-- `99_auswertung` am Ende. Wegwerfdaten (ZZ …), alles wird zurückgerollt.
--   01 Form: Trigger ruft die beiden Hilfsfunktionen, Frist 10 Minuten, beide Vorlagen, Trigger aktiv, kein EXECUTE für Aufrufer, der
--      Freigabe-Trigger bleibt bei `queue_mail`.
--   02 Zusage (Partner, Sitzung freigegeben): eine wartende Zeile mit `send_after = jetzt + 10 Minuten`, Bezug, Variablen, Sprache.
--   03 Vor der Freigabe schickt die Zusage nichts (Gegenstück zu 02).
--   04 Rücknahme: Zusage storniert (`accept_revoked`), Absage ohne Frist, andere Zusagen bleiben wartend.
--   05 Wieder zusagen: neue wartende Zeile, die stornierte bleibt. 06 Doppelklick ändert nichts.
--   07 Warteliste statt Absage storniert ebenso, Warteliste ohne Frist. 08 Schon versendete Zusage bleibt (`sent`).
--   09 Bestätigt die Person vor dem Versand, entfällt die Mail (`accept_confirmed`).
--   10 Sammelentscheidung des Teams verzögert jede Zusage. 11 Freigabe schickt wie bisher ohne Frist; Rücknahme danach storniert auch diese Mail.
--   12 Fremde Sitzung: Entscheidung abgewiesen, nichts verschickt, die Hilfsfunktionen sind für Aufrufer gesperrt.
--   13 Eingangsbestätigung (INSERT `applied`) geht ohne Frist; 14 ohne E-Mail-Adresse kein Fehler und keine Zeile; 15 Zusage per INSERT wartet.
-- Probelauf 08.10.2026 (`db.sh dry-run` mit der Migration): 17 von 17 Erwartungen erfüllt. Mutationsproben an der Migration, 14 Stück: rot sind
-- Zusage ohne Frist, Frist fünf Minuten, Stornierung entfernt, Stornierung nur bei Absage, Grund immer `accept_revoked`, Frist für alle
-- Entscheidungsmails (zweimal), Stornierung zielt auf die Absage-Vorlage, falscher Bezug der wartenden Mail, gleicher Status löst den Trigger weiter
-- aus, bestätigte Zusage storniert nichts, Freigabe-Trigger mit Frist; gleichwertig bleiben zwei: der Zugriff auf `old` ohne UPDATE-Wache (ab
-- PostgreSQL 11 ist `OLD` beim INSERT NULL) und die Stornierung ohne Personenfilter (der Bezug ist je Bewerbung eindeutig).
begin;
create temp table t_res (step text, result text) on commit drop;
create temp table t_erw (step text, muster text) on commit drop;
insert into t_erw values
  ('01_form', '^ok trigger_ruft_helfer=true frist_10=true vorlagen=2 trigger=true ohne_execute=true freigabe_unveraendert=true$'),
  ('02_zusage_wartet', '^ok zeilen=1 status=queued send_after_exakt=true bezug=true application_id=true confirm_by=true first_name=true$'),
  ('02_englisch', '^ok locale=en frist=true$'),
  ('03_vor_freigabe_keine_mail', '^ok mails=0 status=accepted$'),
  ('04_ruecknahme', '^ok zusage_storniert=true grund=accept_revoked zeit_gesetzt=true zusage_wartend=0 absage_wartend=true absage_ohne_frist=true andere_wartet=true$'),
  ('05_wieder_zusagen', '^ok wartend=1 storniert=1 frist=true$'),
  ('06_doppelklick', '^ok zeilen=2 wartend=1$'),
  ('07_warteliste', '^ok zusage_storniert=true grund=accept_revoked warteliste_wartend=true warteliste_ohne_frist=true$'),
  ('08_schon_versendet', '^ok zusage=sent storniert=0 absage_wartend=true$'),
  ('09_bestaetigt', '^ok zusage_storniert=true grund=accept_confirmed wartend=0 weitere_mails=0$'),
  ('10_team_sammel', '^ok entschieden=2 beide_wartend=true frist=true$'),
  ('11_freigabe_sofort', '^ok mails=1 status=queued ohne_frist=true$'),
  ('11_freigabe_ruecknahme', '^ok zusage_storniert=true grund=accept_revoked absage_wartend=true$'),
  ('12_fremd', '^ok decide=rejected 42501 status=shortlisted mails=0 cancel_direkt=rejected 42501 queue_direkt=rejected 42501$'),
  ('13_eingang_sofort', '^ok zeilen=1 ohne_frist=true$'),
  ('14_ohne_adresse', '^ok fehler=false zeilen=0 status=accepted$'),
  ('15_insert_zugesagt', '^ok wartet=true frist=true$');

create function pg_temp.zz_person(p_nachname text, p_lang text default null, p_mail boolean default true) returns uuid language plpgsql as $$
declare v_p uuid;
begin
  insert into person (first_name, last_name, preferred_language) values ('ZZ', p_nachname, p_lang) returning id into v_p;
  if p_mail then
    insert into person_email (person_id, email, is_primary) values (v_p, 'zz-zm-' || lower(replace(p_nachname, ' ', '')) || '-' || v_p::text || '@example.com', true);
  end if;
  return v_p;
end $$;

-- Zeilen der Mail-Warteschlange zu einer Bewerbung (Vorlage, optional Status).
create function pg_temp.zz_n(p_app uuid, p_key text, p_status text default null) returns integer language sql as $$
  select count(*)::integer from mail_log where related_id = p_app and template_key = p_key and (p_status is null or status = p_status)
$$;

do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_claims text;
  v_ed uuid; v_event uuid; v_org uuid; v_org2 uuid; v_oe uuid;
  s_rel uuid; s_open uuid; s_fremd uuid;
  p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid; p6 uuid; p7 uuid; p8 uuid; p9 uuid; p10 uuid; p11 uuid; p_noemail uuid;
  ap1 uuid; ap2 uuid; ap3 uuid; ap4 uuid; ap5 uuid; ap6 uuid; ap7 uuid; ap8 uuid; ap9 uuid; ap10 uuid; ap11 uuid;
  v_m jsonb; v_m2 jsonb; v_r text; v_r2 text; v_r3 text; v_n integer; v_t0 timestamptz := now();
  v_fehler boolean;
begin
  -- Die handelnde Person: ein Konto aus dem Bestand, in der Transaktion ohne Vorrechte; die Partnerrolle gibt `upsert_partner_contact`.
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary where p.auth_user_id is not null limit 1;
  v_claims := json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text;
  delete from role_assignment where person_id = v_pid;
  select id into v_ed from event where is_edition and slug = 'fls27';
  select e.id into v_event from event e where e.edition_id = v_ed and not e.is_edition limit 1;

  -- Team legt zwei Partner-Organisationen an; die handelnde Person wird Hauptkontakt der ersten.
  perform set_config('request.jwt.claims', v_claims, true);
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  insert into organization (legal_name, communication_name, type) values ('ZZ Zusage Host GmbH', 'ZZ Zusage Host', 'corporate') returning id into v_org;
  insert into organization (legal_name, communication_name, type) values ('ZZ Zusage Fremd GmbH', 'ZZ Zusage Fremd', 'corporate') returning id into v_org2;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited') returning id into v_oe;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org2, v_ed, 'invited');
  perform upsert_partner_contact(v_org, v_email, 'Test', 'Person', '{primary_ops}');
  delete from role_assignment where person_id = v_pid and role = 'area_lead_partner';
  perform set_config('request.jwt.claims', '', true);

  -- Drei Sitzungen: freigegeben (Host), nicht freigegeben (Host), freigegeben (fremde Organisation).
  insert into session (event_id, format, title_de, access_mode, capacity, host_org_id, publish_status)
    values (v_event, 'masterclass', 'ZZ Zusage Masterclass frei', 'application', 20, v_org, 'draft') returning id into s_rel;
  insert into session (event_id, format, title_de, access_mode, capacity, host_org_id, publish_status)
    values (v_event, 'masterclass', 'ZZ Zusage Masterclass offen', 'application', 20, v_org, 'draft') returning id into s_open;
  insert into session (event_id, format, title_de, access_mode, capacity, host_org_id, publish_status)
    values (v_event, 'company_tour', 'ZZ Zusage Tour fremd', 'application', 20, v_org2, 'draft') returning id into s_fremd;

  p1 := pg_temp.zz_person('Zusage 1');
  p2 := pg_temp.zz_person('Zusage 2', 'en');
  p3 := pg_temp.zz_person('Zusage 3');
  p4 := pg_temp.zz_person('Zusage 4');
  p5 := pg_temp.zz_person('Zusage 5');
  p6 := pg_temp.zz_person('Zusage 6');
  p7 := pg_temp.zz_person('Zusage 7');
  p8 := pg_temp.zz_person('Zusage 8');
  p9 := pg_temp.zz_person('Zusage 9');
  p10 := pg_temp.zz_person('Zusage 10');
  p11 := pg_temp.zz_person('Zusage 11');
  p_noemail := pg_temp.zz_person('Ohne Adresse', null, false);

  -- Freigabe der beiden Sitzungen s_rel und s_fremd: noch ohne entschiedene Bewerbung, also verschickt der Freigabe-Trigger nichts.
  insert into decision_release (session_id, released_by, note) values (s_rel, v_pid, 'ZZ Test') , (s_fremd, v_pid, 'ZZ Test');

  -- Ausgangsstand ohne Mail: „Engere Wahl“ löst weder beim Anlegen noch nach der Freigabe eine Mail aus.
  insert into application (session_id, person_id, status, consent_share) values (s_rel, p1, 'shortlisted', true) returning id into ap1;
  insert into application (session_id, person_id, status, consent_share) values (s_rel, p2, 'shortlisted', true) returning id into ap2;
  insert into application (session_id, person_id, status, consent_share) values (s_rel, p3, 'shortlisted', true) returning id into ap3;
  insert into application (session_id, person_id, status, consent_share) values (s_rel, p4, 'shortlisted', true) returning id into ap4;
  insert into application (session_id, person_id, status, consent_share) values (s_rel, p5, 'shortlisted', true) returning id into ap5;
  insert into application (session_id, person_id, status, consent_share) values (s_rel, p6, 'shortlisted', true) returning id into ap6;
  insert into application (session_id, person_id, status, consent_share) values (s_open, p7, 'shortlisted', true) returning id into ap7;
  insert into application (session_id, person_id, status, consent_share) values (s_rel, p_noemail, 'shortlisted', true) returning id into ap8;
  insert into application (session_id, person_id, status, consent_share) values (s_fremd, p9, 'shortlisted', true) returning id into ap9;

  -- === 01 Form ====================================================================================================
  insert into t_res values ('01_form',
    'ok trigger_ruft_helfer=' || (pg_get_functiondef('application_mail_trigger'::regproc) like '%queue_mail_debounced%'
                                  and pg_get_functiondef('application_mail_trigger'::regproc) like '%cancel_queued_mail%')::text
    || ' frist_10=' || (pg_get_functiondef('application_mail_trigger'::regproc) like '%interval ''10 minutes''%')::text
    || ' vorlagen=' || (select count(*) from mail_template where key = 'application_accepted' and active)::text
    || ' trigger=' || exists (select 1 from pg_trigger t where t.tgname = 'trg_application_mail' and t.tgenabled = 'O' and not t.tgisinternal)::text
    || ' ohne_execute=' || (not has_function_privilege('authenticated', 'application_mail_trigger()', 'execute')
                            and not has_function_privilege('anon', 'application_mail_trigger()', 'execute'))::text
    || ' freigabe_unveraendert=' || (pg_get_functiondef('decision_release_mail_trigger'::regproc) not like '%queue_mail_debounced%')::text);

  -- === 02 Zusage als Hauptkontakt der Partner-Organisation (Sitzung freigegeben) =====================================
  perform set_config('request.jwt.claims', v_claims, true);
  execute 'set local role authenticated';
  perform decide_application(ap1, 'accepted');
  perform decide_application(ap2, 'accepted');
  execute 'reset role';
  select to_jsonb(m) into v_m from mail_log m where m.related_id = ap1 and m.template_key = 'application_accepted';
  insert into t_res values ('02_zusage_wartet',
    'ok zeilen=' || pg_temp.zz_n(ap1, 'application_accepted')::text || ' status=' || (v_m->>'status')
    || ' send_after_exakt=' || ((v_m->>'send_after')::timestamptz = v_t0 + interval '10 minutes')::text
    || ' bezug=' || ((v_m->>'related_type') = 'application' and (v_m->>'person_id')::uuid = p1)::text
    || ' application_id=' || ((v_m->'meta'->'vars'->>'application_id') = ap1::text)::text
    || ' confirm_by=' || (nullif(v_m->'meta'->'vars'->>'confirm_by', '') is not null)::text
    || ' first_name=' || ((v_m->'meta'->'vars'->>'first_name') = 'ZZ')::text);
  select to_jsonb(m) into v_m2 from mail_log m where m.related_id = ap2 and m.template_key = 'application_accepted';
  insert into t_res values ('02_englisch',
    'ok locale=' || (v_m2->>'locale') || ' frist=' || ((v_m2->>'send_after')::timestamptz = v_t0 + interval '10 minutes')::text);

  -- === 03 Vor der Freigabe schickt die Zusage nichts ================================================================
  execute 'set local role authenticated';
  perform decide_application(ap7, 'accepted');
  execute 'reset role';
  insert into t_res values ('03_vor_freigabe_keine_mail',
    'ok mails=' || (select count(*) from mail_log where related_id = ap7)::text || ' status=' || (select status from application where id = ap7));

  -- === 04 Rücknahme: Zusage zurück auf Absage ======================================================================
  execute 'set local role authenticated';
  perform decide_application(ap1, 'declined');
  execute 'reset role';
  select to_jsonb(m) into v_m from mail_log m where m.related_id = ap1 and m.template_key = 'application_accepted';
  select to_jsonb(m) into v_m2 from mail_log m where m.related_id = ap1 and m.template_key = 'application_declined';
  insert into t_res values ('04_ruecknahme',
    'ok zusage_storniert=' || ((v_m->>'status') = 'cancelled')::text || ' grund=' || (v_m->'meta'->>'cancel_reason')
    || ' zeit_gesetzt=' || ((v_m->'meta'->>'cancelled_at') is not null)::text
    || ' zusage_wartend=' || pg_temp.zz_n(ap1, 'application_accepted', 'queued')::text
    || ' absage_wartend=' || ((v_m2->>'status') = 'queued')::text
    || ' absage_ohne_frist=' || ((v_m2->>'send_after') is null)::text
    || ' andere_wartet=' || (pg_temp.zz_n(ap2, 'application_accepted', 'queued') = 1)::text);

  -- === 05 Wieder zusagen: neue wartende Zeile, die stornierte bleibt ================================================
  execute 'set local role authenticated';
  perform decide_application(ap1, 'accepted');
  execute 'reset role';
  insert into t_res values ('05_wieder_zusagen',
    'ok wartend=' || pg_temp.zz_n(ap1, 'application_accepted', 'queued')::text
    || ' storniert=' || pg_temp.zz_n(ap1, 'application_accepted', 'cancelled')::text
    || ' frist=' || ((select send_after from mail_log where related_id = ap1 and template_key = 'application_accepted' and status = 'queued') = v_t0 + interval '10 minutes')::text);

  -- === 06 Doppelklick: dieselbe Entscheidung noch einmal ändert nichts =============================================
  execute 'set local role authenticated';
  perform decide_application(ap1, 'accepted');
  execute 'reset role';
  insert into t_res values ('06_doppelklick',
    'ok zeilen=' || pg_temp.zz_n(ap1, 'application_accepted')::text || ' wartend=' || pg_temp.zz_n(ap1, 'application_accepted', 'queued')::text);

  -- === 07 Warteliste statt Absage storniert ebenso =================================================================
  execute 'set local role authenticated';
  perform decide_application(ap2, 'waitlisted');
  execute 'reset role';
  select to_jsonb(m) into v_m from mail_log m where m.related_id = ap2 and m.template_key = 'application_accepted';
  select to_jsonb(m) into v_m2 from mail_log m where m.related_id = ap2 and m.template_key = 'application_waitlisted';
  insert into t_res values ('07_warteliste',
    'ok zusage_storniert=' || ((v_m->>'status') = 'cancelled')::text || ' grund=' || (v_m->'meta'->>'cancel_reason')
    || ' warteliste_wartend=' || ((v_m2->>'status') = 'queued')::text || ' warteliste_ohne_frist=' || ((v_m2->>'send_after') is null)::text);

  -- === 08 Eine schon versendete Zusage lässt sich nicht zurückholen ================================================
  execute 'set local role authenticated';
  perform decide_application(ap3, 'accepted');
  execute 'reset role';
  update mail_log set status = 'sent', sent_at = now() where related_id = ap3 and template_key = 'application_accepted';
  execute 'set local role authenticated';
  perform decide_application(ap3, 'declined');
  execute 'reset role';
  insert into t_res values ('08_schon_versendet',
    'ok zusage=' || (select status from mail_log where related_id = ap3 and template_key = 'application_accepted')
    || ' storniert=' || pg_temp.zz_n(ap3, 'application_accepted', 'cancelled')::text
    || ' absage_wartend=' || (pg_temp.zz_n(ap3, 'application_declined', 'queued') = 1)::text);

  -- === 09 Bestätigt die Person vor dem Versand, entfällt die Mail ===================================================
  execute 'set local role authenticated';
  perform decide_application(ap4, 'accepted');
  execute 'reset role';
  update application set status = 'confirmed', confirmed_at = now() where id = ap4;
  select to_jsonb(m) into v_m from mail_log m where m.related_id = ap4 and m.template_key = 'application_accepted';
  insert into t_res values ('09_bestaetigt',
    'ok zusage_storniert=' || ((v_m->>'status') = 'cancelled')::text || ' grund=' || (v_m->'meta'->>'cancel_reason')
    || ' wartend=' || pg_temp.zz_n(ap4, 'application_accepted', 'queued')::text
    || ' weitere_mails=' || (select count(*) from mail_log where related_id = ap4 and template_key <> 'application_accepted')::text);

  -- === 10 Sammelentscheidung des Teams =============================================================================
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'programme_team', 'global');
  execute 'set local role authenticated';
  select count(*) filter (where ok) into v_n from decide_applications(array[ap5, ap6], 'accepted');
  execute 'reset role';
  insert into t_res values ('10_team_sammel',
    'ok entschieden=' || v_n::text
    || ' beide_wartend=' || (pg_temp.zz_n(ap5, 'application_accepted', 'queued') = 1 and pg_temp.zz_n(ap6, 'application_accepted', 'queued') = 1)::text
    || ' frist=' || (select bool_and(send_after = v_t0 + interval '10 minutes') from mail_log where related_id in (ap5, ap6) and template_key = 'application_accepted')::text);

  -- === 11 Freigabe: wie bisher ohne Frist; die Rücknahme danach storniert auch diese Mail ============================
  execute 'set local role authenticated';
  perform release_decisions(s_open, null);
  execute 'reset role';
  select to_jsonb(m) into v_m from mail_log m where m.related_id = ap7 and m.template_key = 'application_accepted';
  insert into t_res values ('11_freigabe_sofort',
    'ok mails=' || pg_temp.zz_n(ap7, 'application_accepted')::text || ' status=' || (v_m->>'status') || ' ohne_frist=' || ((v_m->>'send_after') is null)::text);
  delete from role_assignment where person_id = v_pid and role = 'programme_team';
  execute 'set local role authenticated';
  perform decide_application(ap7, 'declined');
  execute 'reset role';
  select to_jsonb(m) into v_m from mail_log m where m.related_id = ap7 and m.template_key = 'application_accepted';
  insert into t_res values ('11_freigabe_ruecknahme',
    'ok zusage_storniert=' || ((v_m->>'status') = 'cancelled')::text || ' grund=' || (v_m->'meta'->>'cancel_reason')
    || ' absage_wartend=' || (pg_temp.zz_n(ap7, 'application_declined', 'queued') = 1)::text);

  -- === 12 Fremde Sitzung: abgewiesen, nichts verschickt; die Hilfsfunktionen sind gesperrt =============================
  execute 'set local role authenticated';
  begin perform decide_application(ap9, 'accepted'); v_r := 'ALLOWED (BUG)';
  exception when others then v_r := 'rejected ' || sqlstate; end;
  begin perform cancel_queued_mail('application_accepted', ap1, p1, 'x'); v_r2 := 'ALLOWED (BUG)';
  exception when others then v_r2 := 'rejected ' || sqlstate; end;
  begin perform queue_mail_debounced('application_accepted', p1, '{}'::jsonb, 'application', ap1, interval '10 minutes'); v_r3 := 'ALLOWED (BUG)';
  exception when others then v_r3 := 'rejected ' || sqlstate; end;
  execute 'reset role';
  insert into t_res values ('12_fremd',
    'ok decide=' || v_r || ' status=' || (select status from application where id = ap9)
    || ' mails=' || (select count(*) from mail_log where related_id = ap9)::text
    || ' cancel_direkt=' || v_r2 || ' queue_direkt=' || v_r3);

  -- === 13 Eingangsbestätigung: INSERT `applied` geht ohne Frist ======================================================
  insert into application (session_id, person_id, status, consent_share) values (s_rel, p10, 'applied', true) returning id into ap10;
  insert into t_res values ('13_eingang_sofort',
    'ok zeilen=' || pg_temp.zz_n(ap10, 'application_received', 'queued')::text
    || ' ohne_frist=' || ((select send_after from mail_log where related_id = ap10 and template_key = 'application_received') is null)::text);

  -- === 14 Ohne E-Mail-Adresse: kein Fehler, keine Zeile =============================================================
  v_fehler := false;
  begin
    execute 'set local role authenticated';
    perform decide_application(ap8, 'accepted');
    execute 'reset role';
  exception when others then v_fehler := true; execute 'reset role'; end;
  insert into t_res values ('14_ohne_adresse',
    'ok fehler=' || v_fehler::text || ' zeilen=' || (select count(*) from mail_log where related_id = ap8)::text
    || ' status=' || (select status from application where id = ap8));

  -- === 15 Zusage per INSERT (Import) wartet ebenfalls ==================================================================
  insert into application (session_id, person_id, status, consent_share) values (s_rel, p11, 'accepted', true) returning id into ap11;
  select to_jsonb(m) into v_m from mail_log m where m.related_id = ap11 and m.template_key = 'application_accepted';
  insert into t_res values ('15_insert_zugesagt',
    'ok wartet=' || ((v_m->>'status') = 'queued')::text || ' frist=' || ((v_m->>'send_after')::timestamptz = v_t0 + interval '10 minutes')::text);
end $$;
insert into t_res
  select '99_auswertung',
         case when count(*) filter (where not z.erfuellt) = 0 then 'ok: alle ' || count(*)::text || ' Erwartungen erfüllt'
              else 'FEHLER: ' || string_agg(z.step, ', ' order by z.step) filter (where not z.erfuellt) end
    from (select e.step, exists (select 1 from t_res r where r.step = e.step and r.result ~ e.muster) as erfuellt from t_erw e) z;
select * from t_res order by step;
rollback;

-- Smoke-Test v6_partner_publish_gebrandet (Vorschlag, PART-148 c): „Veröffentlichen anfragen“ und Zurücknehmen an der gebrandeten Bühne, Freigabeliste und Freigabe des Teams für Sessions ohne
-- gespeicherte Organisation — und die Standbühne unverändert. Die Organisation wird **abgeleitet** (`session_partner_org`, 0315), an der gebrandeten Bühne nie gespeichert; es gibt dort keine
-- Änderungsmail (LEAD-063, Plan 10.10.).
-- Echter Rollenwechsel: die handelnde Person ist ein Konto aus dem Bestand, deren Rolle je Schritt wechselt (Partner mit Standbühnen-Editor in A, nur Leser in C; Team = area_lead_partner;
-- Programmleitung = programme_team); die Aufrufe laufen unter `set local role authenticated`. Jede Abweisung hat ihr Gegenstück (abgewiesen neben erlaubt); „0 Treffer“ allein beweist nichts.
-- Gelesen wird nur über eigene Zeilen (ZZ …): die Freigabeliste enthält auch echte Sessions. Erwartung je Schritt als Muster in `t_erw`, `99_auswertung` am Ende (ein fehlender Schritt zählt als
-- Abweichung). Wegwerfdaten, alles zurückgerollt.
--   01 Form: alle vier Funktionen nehmen den Helfer, sind Definer mit gepinntem search_path, für `authenticated` ausführbar und für `anon` nicht.
--   02 Anfrage an der gebrandeten Bühne: unvollständig ⇒ 22023 mit den fehlenden Feldern; Team-Session ohne Organisation ⇒ review (nichts gespeichert, Audit mit der Organisation), zweiter Aufruf ändert nichts;
--      eigene Session, Session mit Gastgeber A, Programmleitung an der gebrandeten Bühne; abgewiesen: Gastgeber B, Session von B auf der Bühne von A, Bühne von B, Bühne von C (nur Leser), Hauptbühne, Tisch, Raum, Side-Event-Ort, Standbühne ohne Partner (als Programmleitung, der das Recht am Slot nicht fehlt), ohne Slot,
--      nicht eingeloggt (28000); abgesagt (P0001), unbekannt (P0002); veröffentlicht bleibt veröffentlicht.
--   03 Standbühne unverändert (Regression): anfragen ⇒ review **und Organisation gespeichert**; zurücknehmen ⇒ draft.
--   04 Zurücknehmen: ok (und der Stand ist wirklich `draft`), zweimal ändert nichts, als Leser in C, an der Hauptbühne und für die Session von B abgewiesen; veröffentlicht bleibt.
--   05 Liste des Teams: Partner ⇒ 42501; Team sieht die angefragte Team-Session mit der Organisation der Bühne (auch die auf der Bühne von B — mit B), die Standbühnen-Session, nicht den Entwurf und nicht
--      die in `review` stehende Session der Hauptbühne. Freigabe: Hauptbühne ⇒ not_a_partner_session, Partner ⇒ 42501; Rückgabe ohne Grund ⇒ fields_required, mit Grund ⇒ draft, Slot „angefragt“,
--      Grund beim Partner (`partner_format_sessions`), nichts gespeichert.
--   06 Wieder anfragen (der Grund bleibt bis zur Freigabe), zurücknehmen, anfragen, freigeben ⇒ published, Slot „final“, Grund weg, Audit mit der Organisation, nichts gespeichert; ebenso durch die Programmleitung.
--   07 Keine Änderungsmail an der gebrandeten Bühne: Titeländerung der veröffentlichten Session ⇒ keine Mail `session_changed_partner`; Gegenstück: an der Standbühne (gespeicherte Organisation) kommt sie.
--   08 Nichts gespeichert: keine der Team-Sessions an der gebrandeten Bühne hat danach eine Organisation; die der Standbühne hat sie.
begin;
create temp table t_res (step text, result text) on commit drop;
create temp table t_erw (step text, muster text) on commit drop;
create temp table t_ctx (pid uuid, claims text) on commit drop;
insert into t_erw values
  ('01_form', '^ok nehmen_helfer=4 definer=4 authenticated=4 anon=0$'),
  ('02a_unvollstaendig', '^rejected 22023 fields_required / title_en, description_de\|description_en$'),
  ('02b_anfrage_team_session', '^ok review$'),
  ('02_angefragt', '^ok status=review ohne_org=true audit_org=true audit_anzahl=1$'),
  ('02c_zweimal', '^ok review$'),
  ('02_zweimal', '^ok audit_anzahl=1$'),
  ('02d_eigene_session', '^ok review$'),
  ('02_eigene', '^ok org_a=true$'),
  ('02e_gastgeber_a', '^ok review$'),
  ('02f_gastgeber_b', '^rejected 42501 not allowed$'),
  ('02g_session_von_b', '^rejected 42501 not allowed$'),
  ('02h_buehne_b', '^rejected 42501 not allowed$'),
  ('02i_leser_c', '^rejected 42501 not allowed$'),
  ('02j_haupt', '^rejected 42501 not allowed$'),
  ('02k_tisch', '^rejected 42501 not allowed$'),
  ('02l_raum', '^rejected 42501 not allowed$'),
  ('02m_side_event', '^rejected 42501 not allowed$'),
  ('02n_ohne_slot', '^rejected 42501 not allowed$'),
  ('02o_anonym', '^rejected 28000 not authenticated$'),
  ('02s_stand_ohne_organisation', '^rejected 42501 not allowed$'),
  ('02t_programmleitung_darf', '^ok review$'),
  ('02p_abgesagt', '^rejected P0001 not_editable / cancelled$'),
  ('02q_unbekannt', '^rejected P0002 session_not_found$'),
  ('02r_veroeffentlicht', '^ok published$'),
  ('02_abgewiesene_unveraendert', '^ok geaendert=0$'),
  ('03a_stand_anfrage', '^ok review$'),
  ('03_stand_gespeichert', '^ok org_a=true status=review$'),
  ('03b_stand_zurueck', '^ok draft$'),
  ('04a_zuruecknehmen', '^ok draft$'),
  ('04_status_nach_zuruecknehmen', '^ok status=draft$'),
  ('04b_zuruecknehmen_nochmal', '^ok draft$'),
  ('04c_zuruecknehmen_leser', '^rejected 42501 not allowed$'),
  ('04d_zuruecknehmen_haupt', '^rejected 42501 not allowed$'),
  ('04e_zuruecknehmen_veroeffentlicht', '^ok published$'),
  ('04f_zuruecknehmen_session_von_b', '^rejected 42501 not allowed$'),
  ('05x_stand_erneut', '^ok review$'),
  ('05a_liste_partner', '^rejected 42501 not allowed$'),
  ('05b_liste_team', '^ok$'),
  ('05_liste_team', '^ok angefragt=true angefragt_org=true angefragt_name=true buehne_b=true buehne_b_org=true stand=true stand_org=true entwurf=false haupt_review=false$'),
  ('05c_freigabe_haupt', '^rejected P0001 not_editable / not_a_partner_session$'),
  ('05d_freigabe_partner', '^rejected 42501 not allowed$'),
  ('05e_rueckgabe_ohne_grund', '^rejected 22023 fields_required / note$'),
  ('05f_rueckgabe', '^ok$'),
  ('05_rueckgabe', '^ok status=draft slot=requested grund=true ohne_org=true$'),
  ('05_grund_beim_partner', '^ok grund=true status=draft$'),
  ('06a_erneut', '^ok review$'),
  ('06_grund_bleibt', '^ok grund=true status=review$'),
  ('06b_zurueck', '^ok draft$'),
  ('06_zurueckgenommen_audit', '^ok audit=true status=draft$'),
  ('06c_nochmal', '^ok review$'),
  ('06d_freigabe', '^ok$'),
  ('06_freigegeben', '^ok status=published slot=final grund=false ohne_org=true audit_org=true$'),
  ('06e_anfrage_zwei', '^ok review$'),
  ('06f_freigabe_programmleitung', '^ok$'),
  ('06_programmleitung', '^ok status=published slot=final ohne_org=true$'),
  ('06h_stand_freigabe', '^ok$'),
  ('07_gebrandet_keine_mail', '^ok mails=0$'),
  ('07_stand_mail', '^ok mails=1$'),
  ('08_nichts_gespeichert', '^ok team_ohne_org=true stand_mit_org=true$');

-- Wer handelt: 'partner' (die Person mit ihren Mitgliedschaften in A und C, ohne Teamrolle), 'team' (area_lead_partner) oder 'programm' (programme_team).
create function pg_temp.zz_als(p_wer text) returns void language plpgsql as $$
declare v_pid uuid;
begin
  select pid into v_pid from t_ctx;
  perform set_config('request.jwt.claims', (select claims from t_ctx), true);
  delete from role_assignment where person_id = v_pid and role in ('area_lead_partner', 'programme_team');
  if p_wer = 'team' then insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global'); end if;
  if p_wer = 'programm' then insert into role_assignment (person_id, role, scope_type) values (v_pid, 'programme_team', 'global'); end if;
end $$;

-- Ausführen (optional unter einer Rolle) und das Ergebnis als Zeile ablegen: „ok“ bzw. „ok <Wert>“ oder „rejected <SQLSTATE> <Meldung>[ / <Detail>]“.
create function pg_temp.zz_r(p_step text, p_sql text, p_role text default null, p_wert boolean default false) returns void language plpgsql as $$
declare v_r text; v_v text; v_d text;
begin
  begin
    if p_role is not null then execute 'set local role ' || quote_ident(p_role); end if;
    if p_wert then
      execute p_sql into v_v;
      v_r := 'ok ' || coalesce(v_v, 'null');
    else
      execute p_sql;
      v_r := 'ok';
    end if;
  exception when others then
    get stacked diagnostics v_d = pg_exception_detail;
    v_r := 'rejected ' || sqlstate || ' ' || sqlerrm || coalesce(' / ' || nullif(v_d, ''), '');
  end;
  execute 'reset role';
  insert into t_res values (p_step, v_r);
end $$;

-- Eine Abfrage mit einem jsonb-Ergebnis, optional unter einer Rolle.
create function pg_temp.zz_j(p_sql text, p_role text default null) returns jsonb language plpgsql as $$
declare v_j jsonb;
begin
  if p_role is not null then execute 'set local role ' || quote_ident(p_role); end if;
  execute p_sql into v_j;
  execute 'reset role';
  return v_j;
end $$;

create function pg_temp.zz_person(p_nachname text) returns uuid language plpgsql as $$
declare v_p uuid;
begin
  insert into person (first_name, last_name) values ('ZZ', p_nachname) returning id into v_p;
  insert into person_email (person_id, email, is_primary) values (v_p, 'zz-pg-' || lower(p_nachname) || '-' || v_p::text || '@example.com', true);
  return v_p;
end $$;

-- Ein Slot am ersten Eventtag, `p_n` × 30 Minuten nach 10:00 (Berliner Zeit im Sommer).
create function pg_temp.zz_slot(p_stage uuid, p_day uuid, p_n integer) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into slot (stage_id, event_day_id, start_at, end_at)
  values (p_stage, p_day, timestamptz '2027-04-16 10:00+02' + p_n * interval '30 minutes', timestamptz '2027-04-16 10:25+02' + p_n * interval '30 minutes')
  returning id into v_id;
  return v_id;
end $$;

-- Eine vollständige Session (beide Titel, Beschreibung) auf einem Slot; `p_org` ist `partner_org_id` (leer = vom Team ohne Organisation angelegt).
create function pg_temp.zz_session(p_event uuid, p_slot uuid, p_org uuid, p_titel text) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into session (event_id, slot_id, format, title_de, title_en, description_de, publish_status, partner_org_id)
  values (p_event, p_slot, 'talk', p_titel, p_titel, 'Beschreibung', 'draft', p_org) returning id into v_id;
  return v_id;
end $$;

create function pg_temp.zz_anfrage(p_session uuid) returns text language sql as $$ select format('select partner_request_publish(%L)', p_session) $$;
create function pg_temp.zz_zurueck(p_session uuid) returns text language sql as $$ select format('select partner_withdraw_publish(%L)', p_session) $$;

do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_claims text; v_ed uuid; v_vorlage uuid; v_ev uuid; v_tag uuid; v_json jsonb; v_vorher text;
  o_a uuid; o_b uuid; o_c uuid;
  s_bra_a uuid; s_bra_b uuid; s_bra_c uuid; s_haupt uuid; s_stand_a uuid; s_stand_ohne uuid; s_tisch_a uuid; s_raum_a uuid; s_side_a uuid;
  se_t1 uuid; se_t2 uuid; se_eigene uuid; se_host_a uuid; se_host_b uuid; se_von_b uuid; se_team_b uuid; se_team_c uuid; se_haupt uuid; se_tisch uuid; se_raum uuid; se_side uuid;
  se_ohne_slot uuid; se_pl uuid; se_unvoll uuid; se_abgesagt uuid; se_pub uuid; se_stand uuid; se_stand_ohne uuid; se_entwurf uuid; sl_pub uuid; v_n integer;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null order by p.created_at limit 1;
  if v_pid is null then raise exception 'VORBEDINGUNG: keine Person mit Konto'; end if;
  v_claims := json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text;
  insert into t_ctx values (v_pid, v_claims);
  delete from role_assignment where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select e.id into v_vorlage from event e where e.edition_id = v_ed and not e.is_edition limit 1;
  if v_ed is null or v_vorlage is null then raise exception 'VORBEDINGUNG: Edition fls27 oder Veranstaltung fehlt'; end if;

  -- Veranstaltung mit einem Tag in der Edition
  insert into event (name, format_tag, edition_id, timezone, slug, start_date, end_date)
    select 'ZZ Veröffentlichen gebrandet', e.format_tag, v_ed, 'Europe/Berlin', 'zz-publish-gebrandet-test', date '2027-04-16', date '2027-04-16' from event e where e.id = v_vorlage
    returning id into v_ev;
  insert into event_day (event_id, day_date, programme_start, programme_end, sort_order) values (v_ev, date '2027-04-16', time '09:00', time '18:00', 1) returning id into v_tag;

  -- Organisationen: A (die handelnde Person ist Hauptkontakt und Standbühnen-Editor), B (fremd), C (die Person ist nur Leser)
  insert into organization (legal_name) values ('ZZ PubGeb A GmbH') returning id into o_a;
  insert into organization (legal_name) values ('ZZ PubGeb B GmbH') returning id into o_b;
  insert into organization (legal_name) values ('ZZ PubGeb C GmbH') returning id into o_c;
  insert into org_edition (org_id, edition_id, onboarding_status) select o, v_ed, 'invited' from unnest(array[o_a, o_b, o_c]) o;
  insert into org_membership (org_id, person_id, roles) values (o_a, v_pid, array['primary_ops']);
  insert into org_membership (org_id, person_id, roles) values (o_c, v_pid, array['event_app_member']);
  insert into role_assignment (person_id, role, scope_type, scope_id) values
    (v_pid, 'partner_contact', 'org', o_a), (v_pid, 'partner_contact', 'org', o_c), (v_pid, 'standbuehne_editor', 'org', o_a);

  -- Bühnen: gebrandet A, B und C (main mit Partner), Hauptbühne ohne Partner, Standbühne A, Interview Table A, Raum A, Side-Event-Ort A
  insert into stage (event_id, name, type, partner_org_id, active) values (v_ev, 'ZZ PubGeb Bühne A', 'main', o_a, true) returning id into s_bra_a;
  insert into stage (event_id, name, type, partner_org_id, active) values (v_ev, 'ZZ PubGeb Bühne B', 'main', o_b, true) returning id into s_bra_b;
  insert into stage (event_id, name, type, partner_org_id, active) values (v_ev, 'ZZ PubGeb Bühne C', 'main', o_c, true) returning id into s_bra_c;
  insert into stage (event_id, name, type, active) values (v_ev, 'ZZ PubGeb Hauptbühne', 'main', true) returning id into s_haupt;
  insert into stage (event_id, name, type, partner_org_id, active) values (v_ev, 'ZZ PubGeb Standbühne A', 'partner_booth', o_a, true) returning id into s_stand_a;
  insert into stage (event_id, name, type, active) values (v_ev, 'ZZ PubGeb Standbühne ohne Partner', 'partner_booth', true) returning id into s_stand_ohne;
  insert into stage (event_id, name, type, partner_org_id, active) values (v_ev, 'ZZ PubGeb Tisch A', 'interview_table', o_a, true) returning id into s_tisch_a;
  insert into stage (event_id, name, type, partner_org_id, active) values (v_ev, 'ZZ PubGeb Raum A', 'room', o_a, true) returning id into s_raum_a;
  insert into stage (event_id, name, type, partner_org_id, active) values (v_ev, 'ZZ PubGeb Side-Event A', 'side_event_venue', o_a, true) returning id into s_side_a;

  -- Sessions auf der gebrandeten Bühne A: zwei vom Team ohne Organisation (t1, t2), eine eigene, eine mit Gastgeber A, eine mit Gastgeber B, die von B, eine unvollständige, eine abgesagte, eine veröffentlichte,
  -- ein Entwurf, der nie angefragt wird; auf B und C ohne Organisation; auf Hauptbühne, Tisch, Raum und Side-Event-Ort ohne Organisation; ohne Slot; auf der Standbühne A
  se_t1 := pg_temp.zz_session(v_ev, pg_temp.zz_slot(s_bra_a, v_tag, 0), null, 'ZZ Team-Session 1');
  se_t2 := pg_temp.zz_session(v_ev, pg_temp.zz_slot(s_bra_a, v_tag, 1), null, 'ZZ Team-Session 2');
  se_eigene := pg_temp.zz_session(v_ev, pg_temp.zz_slot(s_bra_a, v_tag, 2), o_a, 'ZZ Eigene Session A');
  se_host_a := pg_temp.zz_session(v_ev, pg_temp.zz_slot(s_bra_a, v_tag, 3), null, 'ZZ Gastgeber A');
  update session set host_org_id = o_a where id = se_host_a;
  se_host_b := pg_temp.zz_session(v_ev, pg_temp.zz_slot(s_bra_a, v_tag, 4), null, 'ZZ Gastgeber B');
  update session set host_org_id = o_b where id = se_host_b;
  se_von_b := pg_temp.zz_session(v_ev, pg_temp.zz_slot(s_bra_a, v_tag, 5), o_b, 'ZZ Session von B auf Bühne A');
  insert into session (event_id, slot_id, format, title_de, publish_status) values (v_ev, pg_temp.zz_slot(s_bra_a, v_tag, 6), 'talk', 'ZZ Unvollständig', 'draft') returning id into se_unvoll;
  se_abgesagt := pg_temp.zz_session(v_ev, pg_temp.zz_slot(s_bra_a, v_tag, 7), null, 'ZZ Abgesagt');
  update session set publish_status = 'cancelled' where id = se_abgesagt;
  sl_pub := pg_temp.zz_slot(s_bra_a, v_tag, 8);
  se_pub := pg_temp.zz_session(v_ev, sl_pub, null, 'ZZ Veröffentlicht');
  update session set publish_status = 'published' where id = se_pub;
  update slot set status = 'final' where id = sl_pub;
  se_entwurf := pg_temp.zz_session(v_ev, pg_temp.zz_slot(s_bra_a, v_tag, 9), null, 'ZZ Entwurf');
  se_pl := pg_temp.zz_session(v_ev, pg_temp.zz_slot(s_bra_a, v_tag, 10), null, 'ZZ Programmleitung');
  se_team_b := pg_temp.zz_session(v_ev, pg_temp.zz_slot(s_bra_b, v_tag, 0), null, 'ZZ Team-Session B');
  se_team_c := pg_temp.zz_session(v_ev, pg_temp.zz_slot(s_bra_c, v_tag, 0), null, 'ZZ Team-Session C');
  se_haupt := pg_temp.zz_session(v_ev, pg_temp.zz_slot(s_haupt, v_tag, 0), null, 'ZZ Hauptbühne');
  se_tisch := pg_temp.zz_session(v_ev, pg_temp.zz_slot(s_tisch_a, v_tag, 0), null, 'ZZ Tisch');
  se_raum := pg_temp.zz_session(v_ev, pg_temp.zz_slot(s_raum_a, v_tag, 0), null, 'ZZ Raum');
  se_side := pg_temp.zz_session(v_ev, pg_temp.zz_slot(s_side_a, v_tag, 0), null, 'ZZ Side-Event');
  insert into session (event_id, format, title_de, title_en, description_de, publish_status) values (v_ev, 'talk', 'ZZ Ohne Slot', 'ZZ Ohne Slot', 'Beschreibung', 'draft') returning id into se_ohne_slot;
  se_stand := pg_temp.zz_session(v_ev, pg_temp.zz_slot(s_stand_a, v_tag, 0), null, 'ZZ Standbühne');
  se_stand_ohne := pg_temp.zz_session(v_ev, pg_temp.zz_slot(s_stand_ohne, v_tag, 0), null, 'ZZ Standbühne ohne Partner');

  -- === 01 Form =====================================================================================================
  insert into t_res values ('01_form',
    'ok nehmen_helfer=' || (select count(*)::text from pg_proc p where p.pronamespace = 'public'::regnamespace
                              and p.proname in ('partner_request_publish', 'partner_withdraw_publish', 'partner_sessions_pending', 'release_partner_session')
                              and p.prosrc like '%session_partner_org(%')
    || ' definer=' || (select count(*)::text from pg_proc p where p.pronamespace = 'public'::regnamespace
                         and p.proname in ('partner_request_publish', 'partner_withdraw_publish', 'partner_sessions_pending', 'release_partner_session')
                         and p.prosecdef and p.proconfig::text like '%search_path=public, extensions%')
    || ' authenticated=' || (select count(*)::text from unnest(array['partner_request_publish(uuid)', 'partner_withdraw_publish(uuid)', 'partner_sessions_pending(uuid)', 'release_partner_session(uuid, boolean, text)']) f
                              where has_function_privilege('authenticated', f, 'execute'))
    || ' anon=' || (select count(*)::text from unnest(array['partner_request_publish(uuid)', 'partner_withdraw_publish(uuid)', 'partner_sessions_pending(uuid)', 'release_partner_session(uuid, boolean, text)']) f
                     where has_function_privilege('anon', f, 'execute')));

  -- === 02 Anfrage an der gebrandeten Bühne =========================================================================
  perform pg_temp.zz_als('partner');
  perform pg_temp.zz_r('02a_unvollstaendig', pg_temp.zz_anfrage(se_unvoll), 'authenticated', true);
  perform pg_temp.zz_r('02b_anfrage_team_session', pg_temp.zz_anfrage(se_t1), 'authenticated', true);
  insert into t_res values ('02_angefragt',
    'ok status=' || (select publish_status from session where id = se_t1)
    || ' ohne_org=' || (select (partner_org_id is null)::text from session where id = se_t1)
    || ' audit_org=' || exists (select 1 from audit_log where action = 'partner.session_publish_requested' and object_id = se_t1::text and (after->>'org_id')::uuid = o_a and after->>'publish_status' = 'review')::text
    || ' audit_anzahl=' || (select count(*)::text from audit_log where action = 'partner.session_publish_requested' and object_id = se_t1::text));
  perform pg_temp.zz_r('02c_zweimal', pg_temp.zz_anfrage(se_t1), 'authenticated', true);
  insert into t_res values ('02_zweimal',
    'ok audit_anzahl=' || (select count(*)::text from audit_log where action = 'partner.session_publish_requested' and object_id = se_t1::text));
  perform pg_temp.zz_r('02d_eigene_session', pg_temp.zz_anfrage(se_eigene), 'authenticated', true);
  insert into t_res values ('02_eigene', 'ok org_a=' || (select (partner_org_id = o_a)::text from session where id = se_eigene));
  perform pg_temp.zz_r('02e_gastgeber_a', pg_temp.zz_anfrage(se_host_a), 'authenticated', true);
  perform pg_temp.zz_r('02f_gastgeber_b', pg_temp.zz_anfrage(se_host_b), 'authenticated', true);
  perform pg_temp.zz_r('02g_session_von_b', pg_temp.zz_anfrage(se_von_b), 'authenticated', true);
  perform pg_temp.zz_r('02h_buehne_b', pg_temp.zz_anfrage(se_team_b), 'authenticated', true);
  perform pg_temp.zz_r('02i_leser_c', pg_temp.zz_anfrage(se_team_c), 'authenticated', true);
  perform pg_temp.zz_r('02j_haupt', pg_temp.zz_anfrage(se_haupt), 'authenticated', true);
  perform pg_temp.zz_r('02k_tisch', pg_temp.zz_anfrage(se_tisch), 'authenticated', true);
  perform pg_temp.zz_r('02l_raum', pg_temp.zz_anfrage(se_raum), 'authenticated', true);
  perform pg_temp.zz_r('02m_side_event', pg_temp.zz_anfrage(se_side), 'authenticated', true);
  perform pg_temp.zz_r('02n_ohne_slot', pg_temp.zz_anfrage(se_ohne_slot), 'authenticated', true);
  -- Programmleitung (Recht am Slot an jeder Bühne): die Standbühne ohne Partner weist sie ab, weil die Bühne keine Organisation hat — nicht, weil ihr das Recht fehlt; an der gebrandeten Bühne darf sie
  perform pg_temp.zz_als('programm');
  perform pg_temp.zz_r('02s_stand_ohne_organisation', pg_temp.zz_anfrage(se_stand_ohne), 'authenticated', true);
  perform pg_temp.zz_r('02t_programmleitung_darf', pg_temp.zz_anfrage(se_pl), 'authenticated', true);
  perform pg_temp.zz_als('partner');
  -- nicht eingeloggt: ohne Anspruch (`current_person_id()` ist leer)
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.zz_r('02o_anonym', pg_temp.zz_anfrage(se_t2), 'authenticated', true);
  perform pg_temp.zz_als('partner');
  perform pg_temp.zz_r('02p_abgesagt', pg_temp.zz_anfrage(se_abgesagt), 'authenticated', true);
  perform pg_temp.zz_r('02q_unbekannt', pg_temp.zz_anfrage(gen_random_uuid()), 'authenticated', true);
  perform pg_temp.zz_r('02r_veroeffentlicht', pg_temp.zz_anfrage(se_pub), 'authenticated', true);
  -- die abgewiesenen Aufrufe ändern nichts: alle noch im Entwurf bzw. wie vorher
  select count(*)::integer into v_n from session
   where (id in (se_host_b, se_von_b, se_team_b, se_team_c, se_haupt, se_tisch, se_raum, se_side, se_ohne_slot, se_stand_ohne, se_unvoll, se_t2, se_entwurf) and publish_status <> 'draft')
      or (id = se_abgesagt and publish_status <> 'cancelled')
      or (id = se_pub and publish_status <> 'published');
  insert into t_res values ('02_abgewiesene_unveraendert', 'ok geaendert=' || v_n::text);

  -- === 03 Standbühne unverändert ===================================================================================
  perform pg_temp.zz_r('03a_stand_anfrage', pg_temp.zz_anfrage(se_stand), 'authenticated', true);
  insert into t_res values ('03_stand_gespeichert',
    'ok org_a=' || (select (partner_org_id = o_a)::text from session where id = se_stand) || ' status=' || (select publish_status from session where id = se_stand));
  perform pg_temp.zz_r('03b_stand_zurueck', pg_temp.zz_zurueck(se_stand), 'authenticated', true);

  -- === 04 Zurücknehmen =============================================================================================
  perform pg_temp.zz_r('04a_zuruecknehmen', pg_temp.zz_zurueck(se_eigene), 'authenticated', true);
  insert into t_res values ('04_status_nach_zuruecknehmen', 'ok status=' || (select publish_status from session where id = se_eigene));
  perform pg_temp.zz_r('04b_zuruecknehmen_nochmal', pg_temp.zz_zurueck(se_eigene), 'authenticated', true);
  perform pg_temp.zz_r('04c_zuruecknehmen_leser', pg_temp.zz_zurueck(se_team_c), 'authenticated', true);
  perform pg_temp.zz_r('04d_zuruecknehmen_haupt', pg_temp.zz_zurueck(se_haupt), 'authenticated', true);
  perform pg_temp.zz_r('04e_zuruecknehmen_veroeffentlicht', pg_temp.zz_zurueck(se_pub), 'authenticated', true);
  perform pg_temp.zz_r('04f_zuruecknehmen_session_von_b', pg_temp.zz_zurueck(se_von_b), 'authenticated', true);

  -- === 05 Liste und Freigabe des Teams =============================================================================
  -- Vorbereitung: eine Session der Hauptbühne und eine der Bühne von B stehen (durch Partner anderer Wege) in `review`; die Standbühnen-Session wird erneut angefragt
  update session set publish_status = 'review' where id in (se_haupt, se_team_b);
  perform pg_temp.zz_r('05x_stand_erneut', pg_temp.zz_anfrage(se_stand), 'authenticated', true);
  perform pg_temp.zz_r('05a_liste_partner', format('select 1 from partner_sessions_pending(%L)', v_ed), 'authenticated');
  perform pg_temp.zz_als('team');
  perform pg_temp.zz_r('05b_liste_team', format('select 1 from partner_sessions_pending(%L)', v_ed), 'authenticated');
  v_json := pg_temp.zz_j(format('select jsonb_agg(to_jsonb(s)) from partner_sessions_pending(%L) s', v_ed), 'authenticated');
  insert into t_res values ('05_liste_team',
    'ok angefragt=' || exists (select 1 from jsonb_array_elements(v_json) e where (e->>'session_id')::uuid = se_t1)::text
    || ' angefragt_org=' || exists (select 1 from jsonb_array_elements(v_json) e where (e->>'session_id')::uuid = se_t1 and (e->>'org_id')::uuid = o_a)::text
    || ' angefragt_name=' || exists (select 1 from jsonb_array_elements(v_json) e where (e->>'session_id')::uuid = se_t1 and e->>'org_name' = 'ZZ PubGeb A GmbH' and e->>'stage_name' = 'ZZ PubGeb Bühne A')::text
    || ' buehne_b=' || exists (select 1 from jsonb_array_elements(v_json) e where (e->>'session_id')::uuid = se_team_b)::text
    || ' buehne_b_org=' || exists (select 1 from jsonb_array_elements(v_json) e where (e->>'session_id')::uuid = se_team_b and (e->>'org_id')::uuid = o_b)::text
    || ' stand=' || exists (select 1 from jsonb_array_elements(v_json) e where (e->>'session_id')::uuid = se_stand)::text
    || ' stand_org=' || exists (select 1 from jsonb_array_elements(v_json) e where (e->>'session_id')::uuid = se_stand and (e->>'org_id')::uuid = o_a)::text
    || ' entwurf=' || exists (select 1 from jsonb_array_elements(v_json) e where (e->>'session_id')::uuid = se_entwurf)::text
    || ' haupt_review=' || exists (select 1 from jsonb_array_elements(v_json) e where (e->>'session_id')::uuid = se_haupt)::text);
  perform pg_temp.zz_r('05c_freigabe_haupt', format('select release_partner_session(%L, true)', se_haupt), 'authenticated');
  perform pg_temp.zz_als('partner');
  perform pg_temp.zz_r('05d_freigabe_partner', format('select release_partner_session(%L, true)', se_t1), 'authenticated');
  perform pg_temp.zz_als('team');
  perform pg_temp.zz_r('05e_rueckgabe_ohne_grund', format('select release_partner_session(%L, false)', se_t1), 'authenticated');
  perform pg_temp.zz_r('05f_rueckgabe', format('select release_partner_session(%L, false, %L)', se_t1, 'ZZ Bitte den Titel schärfen'), 'authenticated');
  insert into t_res values ('05_rueckgabe',
    'ok status=' || (select s.publish_status from session s where s.id = se_t1)
    || ' slot=' || (select sl.status from session s join slot sl on sl.id = s.slot_id where s.id = se_t1)
    || ' grund=' || exists (select 1 from partner_session_return r where r.session_id = se_t1 and r.note = 'ZZ Bitte den Titel schärfen')::text
    || ' ohne_org=' || (select (partner_org_id is null)::text from session where id = se_t1));
  perform pg_temp.zz_als('partner');
  v_json := pg_temp.zz_j(format('select jsonb_agg(to_jsonb(s)) from partner_format_sessions(%L) s', o_a), 'authenticated');
  insert into t_res values ('05_grund_beim_partner',
    'ok grund=' || exists (select 1 from jsonb_array_elements(v_json) e where (e->>'id')::uuid = se_t1 and e->>'return_note' = 'ZZ Bitte den Titel schärfen')::text
    || ' status=' || coalesce((select e->>'publish_status' from jsonb_array_elements(v_json) e where (e->>'id')::uuid = se_t1), 'null'));

  -- === 06 Wieder anfragen, zurücknehmen, freigeben =================================================================
  perform pg_temp.zz_r('06a_erneut', pg_temp.zz_anfrage(se_t1), 'authenticated', true);
  insert into t_res values ('06_grund_bleibt',
    'ok grund=' || exists (select 1 from partner_session_return r where r.session_id = se_t1)::text || ' status=' || (select publish_status from session where id = se_t1));
  perform pg_temp.zz_r('06b_zurueck', pg_temp.zz_zurueck(se_t1), 'authenticated', true);
  insert into t_res values ('06_zurueckgenommen_audit',
    'ok audit=' || exists (select 1 from audit_log where action = 'partner.session_publish_withdrawn' and object_id = se_t1::text
                            and before->>'publish_status' = 'review' and after->>'publish_status' = 'draft')::text
    || ' status=' || (select publish_status from session where id = se_t1));
  perform pg_temp.zz_r('06c_nochmal', pg_temp.zz_anfrage(se_t1), 'authenticated', true);
  perform pg_temp.zz_als('team');
  perform pg_temp.zz_r('06d_freigabe', format('select release_partner_session(%L, true)', se_t1), 'authenticated');
  insert into t_res values ('06_freigegeben',
    'ok status=' || (select s.publish_status from session s where s.id = se_t1)
    || ' slot=' || (select sl.status from session s join slot sl on sl.id = s.slot_id where s.id = se_t1)
    || ' grund=' || exists (select 1 from partner_session_return r where r.session_id = se_t1)::text
    || ' ohne_org=' || (select (partner_org_id is null)::text from session where id = se_t1)
    || ' audit_org=' || exists (select 1 from audit_log where action = 'partner.session_released' and object_id = se_t1::text and (after->>'org_id')::uuid = o_a)::text);
  -- die Programmleitung (nicht das Partner-Team) gibt die zweite frei
  perform pg_temp.zz_als('partner');
  perform pg_temp.zz_r('06e_anfrage_zwei', pg_temp.zz_anfrage(se_t2), 'authenticated', true);
  perform pg_temp.zz_als('programm');
  perform pg_temp.zz_r('06f_freigabe_programmleitung', format('select release_partner_session(%L, true)', se_t2), 'authenticated');
  insert into t_res values ('06_programmleitung',
    'ok status=' || (select s.publish_status from session s where s.id = se_t2)
    || ' slot=' || (select sl.status from session s join slot sl on sl.id = s.slot_id where s.id = se_t2)
    || ' ohne_org=' || (select (partner_org_id is null)::text from session where id = se_t2));
  -- die Standbühne (seit 05 angefragt) wird freigegeben — für die Mail unten
  perform pg_temp.zz_als('team');
  perform pg_temp.zz_r('06h_stand_freigabe', format('select release_partner_session(%L, true)', se_stand), 'authenticated');

  -- === 07 Keine Änderungsmail an der gebrandeten Bühne =============================================================
  -- Die handelnde Person ändert den Titel einer **veröffentlichten** Session (Trigger `trg_session_change_mail`, LEAD-063): an der gebrandeten Bühne kommt keine Mail an den Hauptkontakt,
  -- an der Standbühne (gespeicherte Organisation) schon — das Gegenstück beweist, dass die Mail in dieser Umgebung überhaupt entsteht.
  perform pg_temp.zz_als('partner');
  update session set title_de = 'ZZ Team-Session 2 neu', title_en = 'ZZ Team-Session 2 neu' where id = se_t2;
  insert into t_res values ('07_gebrandet_keine_mail',
    'ok mails=' || (select count(*)::text from mail_log where template_key = 'session_changed_partner' and related_id = se_t2));
  update session set title_de = 'ZZ Standbühne neu', title_en = 'ZZ Standbühne neu' where id = se_stand;
  insert into t_res values ('07_stand_mail',
    'ok mails=' || (select count(*)::text from mail_log where template_key = 'session_changed_partner' and related_id = se_stand));

  -- === 08 Nichts gespeichert =======================================================================================
  insert into t_res values ('08_nichts_gespeichert',
    'ok team_ohne_org=' || (select (count(*) = 8)::text from session where id in (se_t1, se_t2, se_pub, se_entwurf, se_team_b, se_team_c, se_haupt, se_unvoll) and partner_org_id is null)
    || ' stand_mit_org=' || (select (partner_org_id = o_a)::text from session where id = se_stand));
end $$;
insert into t_res
  select '99_auswertung',
         case when count(*) filter (where not z.erfuellt) = 0 then 'alle ' || count(*)::text || ' Schritte richtig'
              else 'FEHLER: ' || string_agg(z.step, ', ' order by z.step) filter (where not z.erfuellt) end
    from (select e.step, exists (select 1 from t_res r where r.step = e.step and r.result ~ e.muster) as erfuellt from t_erw e) z;
select * from t_res order by step;
rollback;

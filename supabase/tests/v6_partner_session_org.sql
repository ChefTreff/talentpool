-- Smoke-Test v6_partner_session_org (Vorschlag, PART-148 Option B): der Helfer `session_partner_org` (ableiten statt speichern) und seine Einsätze — die Liste (`partner_format_sessions`),
-- das Pflegen der Texte (`partner_update_session`) und die Speaker-Wege aus 0293 (`partner_add_speaker`, `partner_speakers`, jetzt über den Helfer, gleiches Verhalten).
-- Echter Rollenwechsel: die handelnde Person ist ein Konto aus dem Bestand, deren Rolle je Schritt wechselt (Partner A mit Bearbeitungsrecht und nur Leser in C, Team); die Aufrufe
-- laufen unter `set local role authenticated` (Helfer in `pg_temp`: unter der Rolle darf man nicht in `t_res` schreiben). Jede Abweisung hat ihr Gegenstück (abgewiesen neben erlaubt);
-- „0 Treffer“ allein beweist nichts. Erwartung je Schritt als Muster in `t_erw`, `99_auswertung` am Ende (ein fehlender Schritt zählt als Abweichung). Wegwerfdaten (ZZ …), alles zurückgerollt.
--   01 Form: der Helfer ist Definer mit gepinntem search_path, stable, ohne EXECUTE für `authenticated` und `anon`; alle vier Funktionen nehmen ihn.
--   02 Helferwerte: eigene Organisation bleibt bei ihr (auch auf der Bühne einer anderen); ohne Organisation an einer gebrandeten Bühne ⇒ die Organisation der Bühne; Hauptbühne, Standbühne,
--      Interview Table, Raum (Masterclass), ohne Slot, unbekannte Session ⇒ NULL; ohne Slot mit eigener Organisation ⇒ diese.
--   03 Liste: Organisation A sieht genau ihre vier (Team-Session auf der gebrandeten Bühne, eigene, veröffentlichte, eigene ohne Slot) — nicht die von B, nicht die auf Bühnen anderer, nicht die
--      ohne Organisation auf Hauptbühne, Standbühne, Tisch, Raum oder ohne Slot, nicht die abgesagte Team-Session; Organisation C (nur Leser) sieht ihre Team-Session; B (fremd) ⇒ 42501, als Team ⇒ B sieht zwei.
--   04 Texte pflegen: die Team-Session der gebrandeten Bühne (Schreibweg, nichts bei der Session gespeichert, Audit), die eigene Session, eine **veröffentlichte** (zurück in die Prüfung,
--      Slot wieder „angefragt“), als Team an der Bühne von B; abgewiesen: Session von B auf der Bühne von A, Bühne von B, Leser in C, Hauptbühne, Standbühne, Tisch, Raum, ohne Slot (42501),
--      **auch als Team** an einer Session ohne Organisation außerhalb der gebrandeten Bühne (`partner_can_edit(NULL)` ist für das Team wahr — die Prüfung auf NULL trägt), unbekannte Session
--      (P0002); die abgewiesenen Aufrufe ändern nichts.
--   05 Speaker (Regression zu 0293): eintragen in die Team-Session ok, in die Session von B und auf die Bühne von B 42501; `partner_speakers` zeigt den Speaker mit seiner Session.
--   06 Nichts gespeichert: keine der Sessions ohne Organisation hat danach eine.
begin;
create temp table t_res (step text, result text) on commit drop;
create temp table t_erw (step text, muster text) on commit drop;
create temp table t_ctx (pid uuid, claims text) on commit drop;
insert into t_erw values
  ('01_form', '^ok helfer_authenticated=false helfer_anon=false definer=true stable=true benutzt=4$'),
  ('02_helfer', '^ok team_a=true eigene_a=true fremd_b=true team_b=true team_c=true haupt=null stand=null tisch=null raum=null ohne_slot=null ohne_slot_org=true unbekannt=null$'),
  ('03a_liste_a', '^ok$'),
  ('03_liste_a', '^ok zeilen=4 team_a=true eigene_a=true pub=true org_ohne_slot=true fremd_b=false team_b=false team_c=false haupt=false stand=false tisch=false raum=false ohne_slot=false abgesagt=false$'),
  ('03b_liste_c', '^ok$'),
  ('03_liste_c', '^ok zeilen=1 team_c=true$'),
  ('03c_liste_b_partner', '^rejected 42501 not allowed$'),
  ('03d_liste_b_team', '^ok$'),
  ('03_liste_b_team', '^ok zeilen=2 fremd_b=true team_b=true$'),
  ('04a_text_team_session', '^ok$'),
  ('04_text_team_session', '^ok titel=true partner_org_null=true audit=true zurueck=false$'),
  ('04b_text_eigene', '^ok$'),
  ('04c_text_fremd', '^rejected 42501 not allowed$'),
  ('04d_text_buehne_b', '^rejected 42501 not allowed$'),
  ('04e_text_leser', '^rejected 42501 not allowed$'),
  ('04f_text_haupt', '^rejected 42501 not allowed$'),
  ('04g_text_stand', '^rejected 42501 not allowed$'),
  ('04h_text_tisch', '^rejected 42501 not allowed$'),
  ('04i_text_raum', '^rejected 42501 not allowed$'),
  ('04j_text_ohne_slot', '^rejected 42501 not allowed$'),
  ('04k_text_veroeffentlicht', '^ok$'),
  ('04_veroeffentlicht', '^ok zurueck=true status=review slot=requested$'),
  ('04l_text_team', '^ok$'),
  ('04_team', '^ok titel=true$'),
  ('04m_text_unbekannt', '^rejected P0002 session_not_found$'),
  ('04n_text_team_ohne_org', '^rejected 42501 not allowed$'),
  ('04n_unveraendert', '^ok titel=true$'),
  ('04z_nichts_geaendert', '^ok geaendert=0$'),
  ('05a_speaker_team_session', '^ok$'),
  ('05_speaker', '^ok verknuepft=true profil_org=true$'),
  ('05b_speaker_fremd', '^rejected 42501 not allowed$'),
  ('05c_speaker_buehne_b', '^rejected 42501 not allowed$'),
  ('05_liste_speaker', '^ok team_session=true fremd_ohne_session=true$'),
  ('06_nichts_gespeichert', '^ok ohne_org=true alle_ohne_org=true$');

-- Wer handelt: 'partner' (die Person mit ihrer Mitgliedschaft in A und C, ohne Teamrolle) oder 'team' (Rolle area_lead_partner).
create function pg_temp.zz_als(p_wer text) returns void language plpgsql as $$
declare v_pid uuid;
begin
  select pid into v_pid from t_ctx;
  perform set_config('request.jwt.claims', (select claims from t_ctx), true);
  delete from role_assignment where person_id = v_pid and role = 'area_lead_partner';
  if p_wer = 'team' then insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global'); end if;
end $$;

-- Ausführen (optional unter einer Rolle) und das Ergebnis als Zeile ablegen: „ok“ oder „rejected <SQLSTATE> <Meldung>“.
create function pg_temp.zz_r(p_step text, p_sql text, p_role text default null) returns void language plpgsql as $$
declare v_r text;
begin
  begin
    if p_role is not null then execute 'set local role ' || quote_ident(p_role); end if;
    execute p_sql;
    v_r := 'ok';
  exception when others then
    v_r := 'rejected ' || sqlstate || ' ' || sqlerrm;
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
  insert into person_email (person_id, email, is_primary) values (v_p, 'zz-so-' || lower(p_nachname) || '-' || v_p::text || '@example.com', true);
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

-- Eine Session auf einem Slot; `p_org` ist `partner_org_id` (leer = vom Team ohne Organisation angelegt).
create function pg_temp.zz_session(p_event uuid, p_slot uuid, p_org uuid, p_titel text) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into session (event_id, slot_id, format, title_de, title_en, description_de, publish_status, partner_org_id)
  values (p_event, p_slot, 'talk', p_titel, p_titel, 'Beschreibung', 'draft', p_org) returning id into v_id;
  return v_id;
end $$;

create function pg_temp.zz_add(p_session uuid, p_vorname text) returns text language sql as $$
  select format('select to_jsonb(partner_add_speaker(%L, %L, %L, %L, false))', p_session,
                'zz-so-' || replace(gen_random_uuid()::text, '-', '') || '@example.org', p_vorname, 'Sprecher')
$$;

create function pg_temp.zz_upd(p_session uuid, p_titel text) returns text language sql as $$
  select format('select to_jsonb(partner_update_session(%L, %L::jsonb))', p_session, jsonb_build_object('title_de', p_titel)::text)
$$;

do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_claims text; v_ed uuid; v_vorlage uuid; v_ev uuid; v_tag uuid; p_lead uuid; p_x uuid;
  o_a uuid; o_b uuid; o_c uuid;
  s_bra_a uuid; s_bra_b uuid; s_bra_c uuid; s_haupt uuid; s_stand_a uuid; s_tisch_a uuid; s_raum_a uuid;
  se_team_a uuid; se_eigene_a uuid; se_fremd_b uuid; se_team_b uuid; se_team_c uuid; se_haupt uuid; se_stand uuid; se_tisch uuid; se_raum uuid; se_ohne_slot uuid; se_ohne_slot_org uuid; se_pub uuid; se_abgesagt uuid;
  sl_pub uuid; v_prof uuid; v_json jsonb; v_n integer; v_fremd_vorher text;
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
    select 'ZZ Session-Organisation', e.format_tag, v_ed, 'Europe/Berlin', 'zz-session-org-test', date '2027-04-16', date '2027-04-16' from event e where e.id = v_vorlage
    returning id into v_ev;
  insert into event_day (event_id, day_date, programme_start, programme_end, sort_order) values (v_ev, date '2027-04-16', time '09:00', time '18:00', 1) returning id into v_tag;

  -- Organisationen: A (die handelnde Person ist Hauptkontakt), B (fremd), C (die Person ist nur Leser)
  insert into organization (legal_name) values ('ZZ Session-Org A GmbH') returning id into o_a;
  insert into organization (legal_name) values ('ZZ Session-Org B GmbH') returning id into o_b;
  insert into organization (legal_name) values ('ZZ Session-Org C GmbH') returning id into o_c;
  insert into org_edition (org_id, edition_id, onboarding_status) select o, v_ed, 'invited' from unnest(array[o_a, o_b, o_c]) o;
  insert into org_membership (org_id, person_id, roles) values (o_a, v_pid, array['primary_ops']);
  insert into org_membership (org_id, person_id, roles) values (o_c, v_pid, array['event_app_member']);
  insert into role_assignment (person_id, role, scope_type, scope_id) values (v_pid, 'partner_contact', 'org', o_a), (v_pid, 'partner_contact', 'org', o_c);

  -- Bühnen: gebrandet A, B und C (main mit Partner), Hauptbühne ohne Partner, Standbühne A, Interview Table A, Raum A (kind masterclass)
  p_lead := pg_temp.zz_person('Leitung');
  insert into stage (event_id, name, type, partner_org_id, active, stage_lead_person_id) values (v_ev, 'ZZ Session-Org Bühne A', 'main', o_a, true, p_lead) returning id into s_bra_a;
  insert into stage (event_id, name, type, partner_org_id, active) values (v_ev, 'ZZ Session-Org Bühne B', 'main', o_b, true) returning id into s_bra_b;
  insert into stage (event_id, name, type, partner_org_id, active) values (v_ev, 'ZZ Session-Org Bühne C', 'main', o_c, true) returning id into s_bra_c;
  insert into stage (event_id, name, type, active) values (v_ev, 'ZZ Session-Org Hauptbühne', 'main', true) returning id into s_haupt;
  insert into stage (event_id, name, type, partner_org_id, active) values (v_ev, 'ZZ Session-Org Standbühne A', 'partner_booth', o_a, true) returning id into s_stand_a;
  insert into stage (event_id, name, type, partner_org_id, active) values (v_ev, 'ZZ Session-Org Tisch A', 'interview_table', o_a, true) returning id into s_tisch_a;
  insert into stage (event_id, name, type, partner_org_id, active) values (v_ev, 'ZZ Session-Org Raum A', 'room', o_a, true) returning id into s_raum_a;

  -- Sessions: auf der gebrandeten Bühne A ohne Organisation (Team), eigene A, die von B; auf B und C ohne Organisation; auf Hauptbühne, Standbühne, Tisch und Raum ohne Organisation;
  -- ohne Slot (ohne und mit Organisation A); eine veröffentlichte Team-Session auf Bühne A mit bestätigtem Slot
  se_team_a := pg_temp.zz_session(v_ev, pg_temp.zz_slot(s_bra_a, v_tag, 0), null, 'ZZ Team-Session A');
  se_eigene_a := pg_temp.zz_session(v_ev, pg_temp.zz_slot(s_bra_a, v_tag, 1), o_a, 'ZZ Eigene Session A');
  se_fremd_b := pg_temp.zz_session(v_ev, pg_temp.zz_slot(s_bra_a, v_tag, 2), o_b, 'ZZ Session von B auf Bühne A');
  se_team_b := pg_temp.zz_session(v_ev, pg_temp.zz_slot(s_bra_b, v_tag, 0), null, 'ZZ Team-Session B');
  se_team_c := pg_temp.zz_session(v_ev, pg_temp.zz_slot(s_bra_c, v_tag, 0), null, 'ZZ Team-Session C');
  se_haupt := pg_temp.zz_session(v_ev, pg_temp.zz_slot(s_haupt, v_tag, 0), null, 'ZZ Session Hauptbühne');
  se_stand := pg_temp.zz_session(v_ev, pg_temp.zz_slot(s_stand_a, v_tag, 0), null, 'ZZ Session Standbühne');
  se_tisch := pg_temp.zz_session(v_ev, pg_temp.zz_slot(s_tisch_a, v_tag, 0), null, 'ZZ Session Tisch');
  se_raum := pg_temp.zz_session(v_ev, pg_temp.zz_slot(s_raum_a, v_tag, 0), null, 'ZZ Session Raum');
  insert into session (event_id, format, title_de, title_en, description_de, publish_status) values (v_ev, 'talk', 'ZZ Ohne Slot', 'ZZ Ohne Slot', 'Beschreibung', 'draft') returning id into se_ohne_slot;
  insert into session (event_id, format, title_de, title_en, description_de, publish_status, partner_org_id) values (v_ev, 'talk', 'ZZ Ohne Slot mit Organisation', 'ZZ Ohne Slot mit Organisation', 'Beschreibung', 'draft', o_a) returning id into se_ohne_slot_org;
  sl_pub := pg_temp.zz_slot(s_bra_a, v_tag, 3);
  se_pub := pg_temp.zz_session(v_ev, sl_pub, null, 'ZZ Veröffentlichte Team-Session A');
  update session set publish_status = 'published' where id = se_pub;
  update slot set status = 'final' where id = sl_pub;
  se_abgesagt := pg_temp.zz_session(v_ev, pg_temp.zz_slot(s_bra_a, v_tag, 4), null, 'ZZ Abgesagte Team-Session A');
  update session set publish_status = 'cancelled' where id = se_abgesagt;

  -- === 01 Form =====================================================================================================
  insert into t_res values ('01_form',
    'ok helfer_authenticated=' || has_function_privilege('authenticated', 'session_partner_org(uuid)', 'execute')::text
    || ' helfer_anon=' || has_function_privilege('anon', 'session_partner_org(uuid)', 'execute')::text
    || ' definer=' || (select (p.prosecdef and p.proconfig::text like '%search_path=public, extensions%')::text from pg_proc p where p.oid = 'session_partner_org(uuid)'::regprocedure)
    || ' stable=' || (select (p.provolatile = 's')::text from pg_proc p where p.oid = 'session_partner_org(uuid)'::regprocedure)
    || ' benutzt=' || (select count(*)::text from pg_proc p where p.pronamespace = 'public'::regnamespace
                          and p.proname in ('partner_format_sessions', 'partner_update_session', 'partner_add_speaker', 'partner_speakers')
                          and p.prosrc like '%session_partner_org(%'));

  -- === 02 Helferwerte ==============================================================================================
  insert into t_res values ('02_helfer',
    'ok team_a=' || (session_partner_org(se_team_a) = o_a)::text
    || ' eigene_a=' || (session_partner_org(se_eigene_a) = o_a)::text
    || ' fremd_b=' || (session_partner_org(se_fremd_b) = o_b)::text
    || ' team_b=' || (session_partner_org(se_team_b) = o_b)::text
    || ' team_c=' || (session_partner_org(se_team_c) = o_c)::text
    || ' haupt=' || coalesce(session_partner_org(se_haupt)::text, 'null')
    || ' stand=' || coalesce(session_partner_org(se_stand)::text, 'null')
    || ' tisch=' || coalesce(session_partner_org(se_tisch)::text, 'null')
    || ' raum=' || coalesce(session_partner_org(se_raum)::text, 'null')
    || ' ohne_slot=' || coalesce(session_partner_org(se_ohne_slot)::text, 'null')
    || ' ohne_slot_org=' || (session_partner_org(se_ohne_slot_org) = o_a)::text
    || ' unbekannt=' || coalesce(session_partner_org(gen_random_uuid())::text, 'null'));

  -- === 03 Liste ====================================================================================================
  perform pg_temp.zz_als('partner');
  perform pg_temp.zz_r('03a_liste_a', format('select 1 from partner_format_sessions(%L)', o_a), 'authenticated');
  v_json := pg_temp.zz_j(format('select jsonb_agg(to_jsonb(s)) from partner_format_sessions(%L) s', o_a), 'authenticated');
  insert into t_res values ('03_liste_a',
    'ok zeilen=' || (select count(*) from jsonb_array_elements(v_json))::text
    || ' team_a=' || exists (select 1 from jsonb_array_elements(v_json) e where (e->>'id')::uuid = se_team_a)::text
    || ' eigene_a=' || exists (select 1 from jsonb_array_elements(v_json) e where (e->>'id')::uuid = se_eigene_a)::text
    || ' pub=' || exists (select 1 from jsonb_array_elements(v_json) e where (e->>'id')::uuid = se_pub)::text
    || ' org_ohne_slot=' || exists (select 1 from jsonb_array_elements(v_json) e where (e->>'id')::uuid = se_ohne_slot_org)::text
    || ' fremd_b=' || exists (select 1 from jsonb_array_elements(v_json) e where (e->>'id')::uuid = se_fremd_b)::text
    || ' team_b=' || exists (select 1 from jsonb_array_elements(v_json) e where (e->>'id')::uuid = se_team_b)::text
    || ' team_c=' || exists (select 1 from jsonb_array_elements(v_json) e where (e->>'id')::uuid = se_team_c)::text
    || ' haupt=' || exists (select 1 from jsonb_array_elements(v_json) e where (e->>'id')::uuid = se_haupt)::text
    || ' stand=' || exists (select 1 from jsonb_array_elements(v_json) e where (e->>'id')::uuid = se_stand)::text
    || ' tisch=' || exists (select 1 from jsonb_array_elements(v_json) e where (e->>'id')::uuid = se_tisch)::text
    || ' raum=' || exists (select 1 from jsonb_array_elements(v_json) e where (e->>'id')::uuid = se_raum)::text
    || ' ohne_slot=' || exists (select 1 from jsonb_array_elements(v_json) e where (e->>'id')::uuid = se_ohne_slot)::text
    || ' abgesagt=' || exists (select 1 from jsonb_array_elements(v_json) e where (e->>'id')::uuid = se_abgesagt)::text);
  -- C: die Person ist nur Leser — die Liste darf sie lesen
  perform pg_temp.zz_r('03b_liste_c', format('select 1 from partner_format_sessions(%L)', o_c), 'authenticated');
  v_json := pg_temp.zz_j(format('select jsonb_agg(to_jsonb(s)) from partner_format_sessions(%L) s', o_c), 'authenticated');
  insert into t_res values ('03_liste_c',
    'ok zeilen=' || (select count(*) from jsonb_array_elements(v_json))::text
    || ' team_c=' || exists (select 1 from jsonb_array_elements(v_json) e where (e->>'id')::uuid = se_team_c)::text);
  -- B: ohne Beziehung ⇒ abgewiesen, als Team gelesen ⇒ zwei
  perform pg_temp.zz_r('03c_liste_b_partner', format('select 1 from partner_format_sessions(%L)', o_b), 'authenticated');
  perform pg_temp.zz_als('team');
  perform pg_temp.zz_r('03d_liste_b_team', format('select 1 from partner_format_sessions(%L)', o_b), 'authenticated');
  v_json := pg_temp.zz_j(format('select jsonb_agg(to_jsonb(s)) from partner_format_sessions(%L) s', o_b), 'authenticated');
  insert into t_res values ('03_liste_b_team',
    'ok zeilen=' || (select count(*) from jsonb_array_elements(v_json))::text
    || ' fremd_b=' || exists (select 1 from jsonb_array_elements(v_json) e where (e->>'id')::uuid = se_fremd_b)::text
    || ' team_b=' || exists (select 1 from jsonb_array_elements(v_json) e where (e->>'id')::uuid = se_team_b)::text);

  -- === 04 Texte pflegen ============================================================================================
  perform pg_temp.zz_als('partner');
  perform pg_temp.zz_r('04a_text_team_session', pg_temp.zz_upd(se_team_a, 'ZZ Team-Session A neu'), 'authenticated');
  insert into t_res values ('04_text_team_session',
    'ok titel=' || (select (title_de = 'ZZ Team-Session A neu')::text from session where id = se_team_a)
    || ' partner_org_null=' || (select (partner_org_id is null)::text from session where id = se_team_a)
    || ' audit=' || exists (select 1 from audit_log where action = 'partner.session_update' and object_id = se_team_a::text and (after->>'back_to_review')::boolean = false)::text
    || ' zurueck=' || (select (publish_status <> 'draft')::text from session where id = se_team_a));
  perform pg_temp.zz_r('04b_text_eigene', pg_temp.zz_upd(se_eigene_a, 'ZZ Eigene Session A neu'), 'authenticated');
  -- Gegenproben: abgewiesen, und nichts verändert
  v_fremd_vorher := (select string_agg(id::text || ':' || coalesce(title_de, ''), ',' order by id) from session where id in (se_fremd_b, se_team_b, se_team_c, se_haupt, se_stand, se_tisch, se_raum, se_ohne_slot));
  perform pg_temp.zz_r('04c_text_fremd', pg_temp.zz_upd(se_fremd_b, 'ZZ Fremd neu'), 'authenticated');
  perform pg_temp.zz_r('04d_text_buehne_b', pg_temp.zz_upd(se_team_b, 'ZZ B neu'), 'authenticated');
  perform pg_temp.zz_r('04e_text_leser', pg_temp.zz_upd(se_team_c, 'ZZ C neu'), 'authenticated');
  perform pg_temp.zz_r('04f_text_haupt', pg_temp.zz_upd(se_haupt, 'ZZ Haupt neu'), 'authenticated');
  perform pg_temp.zz_r('04g_text_stand', pg_temp.zz_upd(se_stand, 'ZZ Stand neu'), 'authenticated');
  perform pg_temp.zz_r('04h_text_tisch', pg_temp.zz_upd(se_tisch, 'ZZ Tisch neu'), 'authenticated');
  perform pg_temp.zz_r('04i_text_raum', pg_temp.zz_upd(se_raum, 'ZZ Raum neu'), 'authenticated');
  perform pg_temp.zz_r('04j_text_ohne_slot', pg_temp.zz_upd(se_ohne_slot, 'ZZ Ohne neu'), 'authenticated');
  insert into t_res values ('04z_nichts_geaendert',
    'ok geaendert=' || (case when v_fremd_vorher is distinct from (select string_agg(id::text || ':' || coalesce(title_de, ''), ',' order by id) from session where id in (se_fremd_b, se_team_b, se_team_c, se_haupt, se_stand, se_tisch, se_raum, se_ohne_slot)) then 1 else 0 end)::text);
  -- eine veröffentlichte Team-Session: der Titel ändert sich ⇒ zurück in die Prüfung, der Slot wieder „angefragt“
  perform pg_temp.zz_r('04k_text_veroeffentlicht', pg_temp.zz_upd(se_pub, 'ZZ Veröffentlichte Team-Session A neu'), 'authenticated');
  insert into t_res values ('04_veroeffentlicht',
    'ok zurueck=' || exists (select 1 from audit_log where action = 'partner.session_update' and object_id = se_pub::text and (after->>'back_to_review')::boolean = true)::text
    || ' status=' || (select publish_status from session where id = se_pub)
    || ' slot=' || (select status from slot where id = sl_pub));
  -- als Team an der Bühne von B
  perform pg_temp.zz_als('team');
  perform pg_temp.zz_r('04l_text_team', pg_temp.zz_upd(se_team_b, 'ZZ Team-Session B neu'), 'authenticated');
  insert into t_res values ('04_team', 'ok titel=' || (select (title_de = 'ZZ Team-Session B neu')::text from session where id = se_team_b));
  perform pg_temp.zz_r('04m_text_unbekannt', pg_temp.zz_upd(gen_random_uuid(), 'ZZ Nichts'), 'authenticated');
  -- das Team darf über diese Funktion nicht an Sessions ohne Organisation (partner_can_edit(NULL) ist für das Team wahr — die Prüfung auf NULL hält)
  perform pg_temp.zz_r('04n_text_team_ohne_org', pg_temp.zz_upd(se_haupt, 'ZZ Haupt vom Team'), 'authenticated');
  insert into t_res values ('04n_unveraendert', 'ok titel=' || (select (title_de = 'ZZ Session Hauptbühne')::text from session where id = se_haupt));

  -- === 05 Speaker (Regression zu 0293) =============================================================================
  perform pg_temp.zz_als('partner');
  perform pg_temp.zz_r('05a_speaker_team_session', pg_temp.zz_add(se_team_a, 'Erste'), 'authenticated');
  v_prof := (select sp.id from session_speaker ss join speaker_profile sp on sp.person_id = ss.person_id where ss.session_id = se_team_a and ss.role = 'speaker' limit 1);
  insert into t_res values ('05_speaker',
    'ok verknuepft=' || (v_prof is not null)::text
    || ' profil_org=' || (select (created_by_org_id = o_a)::text from speaker_profile where id = v_prof));
  perform pg_temp.zz_r('05b_speaker_fremd', pg_temp.zz_add(se_fremd_b, 'Zweite'), 'authenticated');
  perform pg_temp.zz_r('05c_speaker_buehne_b', pg_temp.zz_add(se_team_b, 'Dritte'), 'authenticated');
  -- partner_speakers: der Speaker steht mit der Team-Session da; ein Speaker von A an einer Session von B bleibt ohne Verknüpfung
  p_x := pg_temp.zz_person('Fremdverknuepft');
  insert into speaker_profile (person_id, edition_id, pipeline_status, created_by_org_id) values (p_x, v_ed, 'lead', o_a);
  insert into session_speaker (session_id, person_id, role) values (se_fremd_b, p_x, 'speaker');
  v_json := pg_temp.zz_j(format('select jsonb_agg(to_jsonb(s)) from partner_speakers(%L) s', o_a), 'authenticated');
  insert into t_res values ('05_liste_speaker',
    'ok team_session=' || exists (select 1 from jsonb_array_elements(v_json) e where (e->>'profile_id')::uuid = v_prof and (e->>'session_id')::uuid = se_team_a)::text
    || ' fremd_ohne_session=' || (not exists (select 1 from jsonb_array_elements(v_json) e where (e->>'person_id')::uuid = p_x and (e->>'session_id')::uuid = se_fremd_b))::text);

  -- === 06 Nichts gespeichert =======================================================================================
  insert into t_res values ('06_nichts_gespeichert',
    'ok ohne_org=' || (select (count(*) = 0)::text from session where id in (se_team_a, se_team_b, se_team_c, se_haupt, se_stand, se_tisch, se_raum, se_ohne_slot, se_pub) and partner_org_id is not null)
    || ' alle_ohne_org=' || (select (count(*) = 9)::text from session where id in (se_team_a, se_team_b, se_team_c, se_haupt, se_stand, se_tisch, se_raum, se_ohne_slot, se_pub) and partner_org_id is null));
end $$;
insert into t_res
  select '99_auswertung',
         case when count(*) filter (where not z.erfuellt) = 0 then 'alle ' || count(*)::text || ' Schritte richtig'
              else 'FEHLER: ' || string_agg(z.step, ', ' order by z.step) filter (where not z.erfuellt) end
    from (select e.step, exists (select 1 from t_res r where r.step = e.step and r.result ~ e.muster) as erfuellt from t_erw e) z;
select * from t_res order by step;
rollback;

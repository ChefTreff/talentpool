-- Smoke-Test v6_freigabe_verlauf (Vorschlag, ADM-081 Teil 2): `freigabe_verlauf(p_art, p_limit, p_before_at, p_before_id)`
-- — „Bereits freigegeben“ je Reiter der Freigabe-Übersicht, neueste zuerst, Keyset-Blättern.
-- Belegt mit echtem Rollenwechsel (vor jedem Abschnitt steht die Rolle) und Testdaten **mit Gegenstücken**:
--   01 Aufbau: je Art entschiedene Einträge (zählen) und Gegenstücke (offen, abgelehnt, storniert — zählen nicht).
--   02 Tor je Art und Rolle (Plan 05.10.): ohne Rolle und area_lead_production überall 42501; area_lead_speaker: alles außer
--      `slots` (kein Programm-Team ⇒ is_programme_editor falsch); programme_team: alles außer `reisekosten`; admin: alles.
--   03 Inhalt je Art: nur positive Entscheidungen, Entscheidender mit Vor- und Nachnamen, Titel/Betrag/Kontingent/Abholzeit,
--      neueste zuerst; `slots` aus dem Audit nur mit Akteur und Zeitpunkt (der Text im Audit erscheint **nicht**).
--   04 Blättern: Seite für Seite ohne Doppelte und Lücken, auch bei gleichem Zeitpunkt (Tie-Break über die Kennung);
--      Deckel 50; halber Cursor 22023; unbekannte Art 22023; ohne Anmeldung 28000.
--   05 Form: keine E-Mail-Spalte; DEFINER, STABLE, search_path gepinnt; anon kein EXECUTE, authenticated ja.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text;
  v_ev uuid; v_ed uuid; v_tz text; v_day event_day%rowtype; v_start timestamptz; v_t timestamptz := now();
  v_org uuid; v_main uuid; v_booth uuid; v_slot1 uuid; v_slot2 uuid; v_se_main uuid; v_se_booth uuid;
  v_other uuid; v_sp uuid; v_q uuid;
  v_sub1 uuid; v_sub2 uuid; v_sub_offen uuid; v_sub_abgelehnt uuid;
  v_ex1 uuid; v_ex2 uuid; v_ex3 uuid; v_ex_offen uuid; v_ex_abgelehnt uuid;
  v_ho1 uuid; v_ho2 uuid; v_ho_offen uuid; v_ho_storno uuid;
  v_sh1 uuid; v_sh2 uuid; v_sh_offen uuid;
  v_rolle text; v_art text; v_erlaubt text; v_ergebnis text; v_fehler text; v_n integer; v_ids uuid[]; v_r record;
  v_at timestamptz; v_id uuid; v_gesehen uuid[]; v_seite integer;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary where p.auth_user_id is not null limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  update person set first_name = 'ZZ', last_name = 'Entscheider' where id = v_pid;   -- feste Namen für die Prüfung (Rollback)

  select e.id, e.timezone into v_ev, v_tz
    from event e where not e.is_edition and exists (select 1 from stage st where st.event_id = e.id)
   order by (e.format_tag is distinct from 'summit'), e.start_date limit 1;
  select ed.* into v_day from event_day ed where ed.event_id = v_ev order by ed.day_date limit 1;
  v_start := (v_day.day_date + time '09:00') at time zone v_tz;
  select e.id into v_ed from event e where e.is_edition order by e.start_date desc limit 1;

  -- === 01 · Aufbau (als Owner) ==================================================================================
  insert into person (first_name, last_name) values ('ZZ', 'Verlaufsspeaker') returning id into v_other;
  insert into person_email (person_id, email, is_primary) values (v_other, 'zz-verlauf-' || v_other::text || '@example.com', true);
  insert into speaker_profile (person_id, edition_id, speaker_type, hospitality_status, created_by)
    values (v_other, v_ed, 'panelist', 'requested', v_pid) returning id into v_sp;
  insert into organization (communication_name) values ('ZZ Verlauf Partner') returning id into v_org;

  -- Slots: eine Hauptbühne und eine Standbühne mit je einer Session
  insert into stage (event_id, name, slug, type)
    values (v_ev, 'ZZ Verlauf Hauptbühne', 'zz-verlauf-main-' || substr(gen_random_uuid()::text, 1, 6), 'main') returning id into v_main;
  insert into stage (event_id, name, slug, type, partner_org_id)
    values (v_ev, 'ZZ Verlauf Standbühne', 'zz-verlauf-booth-' || substr(gen_random_uuid()::text, 1, 6), 'partner_booth', v_org) returning id into v_booth;
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status)
    values (v_main, v_day.id, v_start, v_start + interval '30 minutes', 'content', 'requested') returning id into v_slot1;
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status)
    values (v_booth, v_day.id, v_start, v_start + interval '30 minutes', 'content', 'requested') returning id into v_slot2;
  insert into session (event_id, slot_id, format, title_de, title_en, description_de, publish_status)
    values (v_ev, v_slot1, 'talk', 'ZZ Verlauf Hauptbühne Talk', 'ZZ history main talk', 'Beschreibung', 'published') returning id into v_se_main;
  insert into session (event_id, slot_id, format, title_de, title_en, description_de, partner_org_id, host_org_id, publish_status)
    values (v_ev, v_slot2, 'talk', 'ZZ Verlauf Standbühne Talk', 'ZZ history booth talk', 'Beschreibung', v_org, v_org, 'published') returning id into v_se_booth;
  -- Das Audit trägt Akteur, Zeitpunkt — und Text, den der Verlauf **nicht** zeigen darf.
  insert into audit_log (actor_person_id, action, object_type, object_id, after, created_at)
    values (v_pid, 'session.publish', 'session', v_se_main::text, jsonb_build_object('geheim', 'GEHEIMER AUDITTEXT'), v_t - interval '10 minutes');
  insert into audit_log (actor_person_id, action, object_type, object_id, after, created_at)
    values (v_pid, 'partner.session_released', 'session', v_se_booth::text, jsonb_build_object('note', 'GEHEIMER AUDITTEXT'), v_t - interval '20 minutes');
  insert into audit_log (actor_person_id, action, object_type, object_id, created_at)
    values (v_pid, 'session.update', 'session', v_se_main::text, v_t - interval '1 minute');                       -- Gegenstück: andere Handlung
  insert into audit_log (actor_person_id, action, object_type, object_id, created_at)
    values (v_pid, 'partner.session_rejected', 'session', v_se_booth::text, v_t - interval '2 minutes');          -- Gegenstück: abgelehnt

  -- Titel & Beschreibungen: zwei freigegeben, ein Vorschlag offen, einer abgelehnt
  insert into session_submission (session_id, speaker_profile_id, submitted_by, title, status, reviewed_by, reviewed_at, review_note)
    values (v_se_main, v_sp, v_other, 'ZZ Vorschlag neu', 'approved', v_pid, v_t - interval '30 minutes', 'Passt so.') returning id into v_sub1;
  insert into session_submission (session_id, speaker_profile_id, submitted_by, title, status, reviewed_by, reviewed_at)
    values (v_se_main, v_sp, v_other, 'ZZ Vorschlag älter', 'approved', v_pid, v_t - interval '40 minutes') returning id into v_sub2;
  insert into session_submission (session_id, speaker_profile_id, submitted_by, title, status) values (v_se_main, v_sp, v_other, 'ZZ Vorschlag offen', 'submitted') returning id into v_sub_offen;
  insert into session_submission (session_id, speaker_profile_id, submitted_by, title, status, reviewed_by, reviewed_at)
    values (v_se_main, v_sp, v_other, 'ZZ Vorschlag abgelehnt', 'rejected', v_pid, v_t - interval '35 minutes') returning id into v_sub_abgelehnt;

  -- Reisekosten: freigegeben (zwei mit **gleichem** Zeitpunkt für den Tie-Break) und bezahlt; offen und abgelehnt zählen nicht
  insert into expense_claim (profile_id, status, positions, amount_cents, invoice_no, reviewed_by, reviewed_at, review_note)
    values (v_sp, 'approved', '[]'::jsonb, 15190, 'ZZTEST-V-0001', v_pid, v_t - interval '50 minutes', 'ok') returning id into v_ex1;
  insert into expense_claim (profile_id, status, positions, amount_cents, invoice_no, reviewed_by, reviewed_at)
    values (v_sp, 'paid', '[]'::jsonb, 9900, 'ZZTEST-V-0002', v_pid, v_t - interval '50 minutes') returning id into v_ex2;
  insert into expense_claim (profile_id, status, positions, amount_cents, invoice_no, reviewed_by, reviewed_at)
    values (v_sp, 'approved', '[]'::jsonb, 100, 'ZZTEST-V-0003', v_pid, v_t - interval '60 minutes') returning id into v_ex3;
  insert into expense_claim (profile_id, status, positions, amount_cents, invoice_no) values (v_sp, 'submitted', '[]'::jsonb, 100, 'ZZTEST-V-0004') returning id into v_ex_offen;
  insert into expense_claim (profile_id, status, positions, amount_cents, invoice_no, reviewed_by, reviewed_at)
    values (v_sp, 'rejected', '[]'::jsonb, 100, 'ZZTEST-V-0005', v_pid, v_t - interval '45 minutes') returning id into v_ex_abgelehnt;

  -- Hotel: zwei bestätigt; angefragt und storniert zählen nicht
  insert into hospitality_quota (edition_id, kind, tier, label_de, label_en, capacity)
    values (v_ed, 'hotel', 'standard', 'ZZ Verlauf Hotel', 'ZZ Verlauf Hotel', 5) returning id into v_q;
  insert into hospitality_booking (quota_id, profile_id, kind, status, guests, created_by, confirmed_by, confirmed_at, team_note)
    values (v_q, v_sp, 'hotel', 'confirmed', 1, v_other, v_pid, v_t - interval '70 minutes', 'Zimmer 101') returning id into v_ho1;
  insert into hospitality_booking (quota_id, profile_id, kind, status, guests, created_by, confirmed_by, confirmed_at)
    values (v_q, v_sp, 'hotel', 'confirmed', 1, v_other, v_pid, v_t - interval '80 minutes') returning id into v_ho2;
  insert into hospitality_booking (quota_id, profile_id, kind, status, guests, created_by) values (v_q, v_sp, 'hotel', 'requested', 1, v_other) returning id into v_ho_offen;
  insert into hospitality_booking (quota_id, profile_id, kind, status, guests, created_by, cancelled_at) values (v_q, v_sp, 'hotel', 'cancelled', 1, v_other, v_t) returning id into v_ho_storno;

  -- Shuttle: zwei bestätigt, eine angefragt
  insert into shuttle_booking (profile_id, passenger_name, pickup_at, pickup_location, dropoff_location, status, confirmed_by, confirmed_at, note)
    values (v_sp, 'ZZ Fahrgast eins', v_t + interval '30 days', 'Hbf', 'Messe', 'confirmed', v_pid, v_t - interval '90 minutes', 'Schild mit Namen') returning id into v_sh1;
  insert into shuttle_booking (profile_id, passenger_name, pickup_at, pickup_location, dropoff_location, status, confirmed_by, confirmed_at)
    values (v_sp, 'ZZ Fahrgast zwei', v_t + interval '31 days', 'Messe', 'Flughafen', 'confirmed', v_pid, v_t - interval '100 minutes') returning id into v_sh2;
  insert into shuttle_booking (profile_id, passenger_name, pickup_at, pickup_location, dropoff_location, status)
    values (v_sp, 'ZZ Fahrgast offen', v_t + interval '32 days', 'Hbf', 'Messe', 'requested') returning id into v_sh_offen;

  -- Sechzig weitere bestätigte Hotelbuchungen, älter als alles andere: erst damit zeigt sich der Deckel von 50
  insert into hospitality_booking (quota_id, profile_id, kind, status, guests, created_by, confirmed_by, confirmed_at)
    select v_q, v_sp, 'hotel', 'confirmed', 1, v_other, v_pid, v_t - make_interval(mins => 200 + g) from generate_series(1, 60) g;

  insert into t_res values ('01_aufbau', 'inhalte=2+2 slots=2+2 reisekosten=3+2 hotel=2+60+2 shuttle=2+1 (zählen + Gegenstücke)');

  -- === 02 · Tor je Art und Rolle =================================================================================
  foreach v_rolle in array array['keine', 'area_lead_production', 'area_lead_speaker', 'programme_team', 'admin'] loop
    delete from role_assignment where person_id = v_pid;
    if v_rolle <> 'keine' then
      insert into role_assignment (person_id, role, scope_type) values (v_pid, v_rolle, 'global');
    end if;
    v_erlaubt := case v_rolle
      when 'keine'                then ''
      when 'area_lead_production' then ''
      when 'area_lead_speaker'    then 'inhalte,reisekosten,hotel,shuttle'
      when 'programme_team'       then 'inhalte,slots,hotel,shuttle'
      else 'inhalte,slots,reisekosten,hotel,shuttle'
    end;
    v_fehler := '';
    foreach v_art in array array['inhalte', 'slots', 'reisekosten', 'hotel', 'shuttle'] loop
      begin
        perform * from freigabe_verlauf(v_art, 1);
        v_ergebnis := 'ok';
      exception when others then
        v_ergebnis := 'rejected ' || sqlstate;
      end;
      if (position(v_art in v_erlaubt) > 0) and v_ergebnis <> 'ok' then v_fehler := v_fehler || ' ' || v_art || ' ' || v_ergebnis || ' (erwartet ok);'; end if;
      if (position(v_art in v_erlaubt) = 0) and v_ergebnis <> 'rejected 42501' then v_fehler := v_fehler || ' ' || v_art || ' ' || v_ergebnis || ' (erwartet 42501);'; end if;
    end loop;
    insert into t_res values ('02_tor_' || v_rolle, case when v_fehler = '' then 'ok (' || coalesce(nullif(v_erlaubt, ''), 'keine Art') || ')' else 'FEHLER' || v_fehler end);
  end loop;

  -- === 03 · Inhalt je Art (als admin) ============================================================================
  delete from role_assignment where person_id = v_pid;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');

  -- inhalte: nur die beiden freigegebenen, neueste zuerst, Entscheidender und Einreichende mit Namen
  select array_agg(f.objekt_id order by f.entschieden_am desc, f.objekt_id desc) into v_ids
    from freigabe_verlauf('inhalte', 50) f where f.objekt_id in (v_sub1, v_sub2, v_sub_offen, v_sub_abgelehnt);
  select * into v_r from freigabe_verlauf('inhalte', 50) f where f.objekt_id = v_sub1;
  insert into t_res values ('03_inhalte', case when v_ids = array[v_sub1, v_sub2] then 'ok' else 'FEHLER ' || coalesce(v_ids::text, 'leer') end
    || ' von=' || coalesce(v_r.entschieden_von, '-') || ' titel=' || coalesce(v_r.titel, '-') || ' detail=' || coalesce(v_r.detail, '-') || ' notiz=' || coalesce(v_r.notiz, '-'));

  -- slots: Hauptbühne (Publish) und Standbühne (Freigabe), Akteur und Zeitpunkt, **nicht** der Text im Audit
  select array_agg(f.objekt_id order by f.entschieden_am desc, f.objekt_id desc) into v_ids
    from freigabe_verlauf('slots', 50) f where f.objekt_id in (v_se_main, v_se_booth);
  select * into v_r from freigabe_verlauf('slots', 50) f where f.objekt_id = v_se_booth;
  insert into t_res values ('03_slots', case when v_ids = array[v_se_main, v_se_booth] then 'ok' else 'FEHLER ' || coalesce(v_ids::text, 'leer') end
    || ' von=' || coalesce(v_r.entschieden_von, '-') || ' titel=' || coalesce(v_r.titel, '-') || ' detail=' || coalesce(v_r.detail, '-')
    || ' notiz=' || coalesce(v_r.notiz, 'null') || ' termin=' || (v_r.termin is not null)::text
    || ' auditText=' || (exists (select 1 from freigabe_verlauf('slots', 50) f
                                  where coalesce(f.detail, '') || coalesce(f.notiz, '') || coalesce(f.titel, '') like '%GEHEIM%'))::text);
  insert into t_res values ('03_slots_nur_publish_und_freigabe', (select count(*)::text from freigabe_verlauf('slots', 50) f where f.objekt_id in (v_se_main, v_se_booth))
    || ' Zeilen für 2 Sessions mit je 1 Freigabe-Eintrag und je 1 Gegenstück (update, rejected)');

  -- reisekosten: approved und paid, gleicher Zeitpunkt ⇒ beide, Betrag in Cent; offen und abgelehnt nicht
  select array_agg(f.objekt_id order by f.entschieden_am desc, f.objekt_id desc) into v_ids
    from freigabe_verlauf('reisekosten', 50) f where f.objekt_id in (v_ex1, v_ex2, v_ex3, v_ex_offen, v_ex_abgelehnt);
  select * into v_r from freigabe_verlauf('reisekosten', 50) f where f.objekt_id = v_ex1;
  insert into t_res values ('03_reisekosten', case when v_ids @> array[v_ex1, v_ex2, v_ex3] and cardinality(v_ids) = 3 and v_ids[3] = v_ex3 then 'ok' else 'FEHLER ' || coalesce(v_ids::text, 'leer') end
    || ' betrag=' || coalesce(v_r.betrag_cents::text, '-') || ' titel=' || coalesce(v_r.titel, '-') || ' detail=' || coalesce(v_r.detail, '-')
    || ' von=' || coalesce(v_r.entschieden_von, '-') || ' notiz=' || coalesce(v_r.notiz, '-'));

  -- hotel: nur bestätigte, mit Kontingent als Detail
  select array_agg(f.objekt_id order by f.entschieden_am desc, f.objekt_id desc) into v_ids
    from freigabe_verlauf('hotel', 50) f where f.objekt_id in (v_ho1, v_ho2, v_ho_offen, v_ho_storno);
  select * into v_r from freigabe_verlauf('hotel', 50) f where f.objekt_id = v_ho1;
  insert into t_res values ('03_hotel', case when v_ids = array[v_ho1, v_ho2] then 'ok' else 'FEHLER ' || coalesce(v_ids::text, 'leer') end
    || ' titel=' || coalesce(v_r.titel, '-') || ' detail=' || coalesce(v_r.detail, '-') || ' notiz=' || coalesce(v_r.notiz, '-') || ' von=' || coalesce(v_r.entschieden_von, '-'));

  -- shuttle: nur bestätigte, Strecke als Detail, Abholzeit als Termin
  select array_agg(f.objekt_id order by f.entschieden_am desc, f.objekt_id desc) into v_ids
    from freigabe_verlauf('shuttle', 50) f where f.objekt_id in (v_sh1, v_sh2, v_sh_offen);
  select * into v_r from freigabe_verlauf('shuttle', 50) f where f.objekt_id = v_sh1;
  insert into t_res values ('03_shuttle', case when v_ids = array[v_sh1, v_sh2] then 'ok' else 'FEHLER ' || coalesce(v_ids::text, 'leer') end
    || ' titel=' || coalesce(v_r.titel, '-') || ' detail=' || coalesce(v_r.detail, '-') || ' termin=' || (v_r.termin is not null)::text || ' notiz=' || coalesce(v_r.notiz, '-'));

  -- === 04 · Blättern ===========================================================================================
  -- Seite für Seite mit Limit 1 über die Reisekosten: die drei Testzeilen (zwei mit **gleichem** Zeitpunkt) kommen genau einmal.
  v_gesehen := '{}'; v_at := null; v_id := null; v_seite := 0; v_fehler := '';
  loop
    select f.objekt_id, f.entschieden_am into v_r from freigabe_verlauf('reisekosten', 1, v_at, v_id) f;
    exit when v_r.objekt_id is null or v_seite >= 200;
    v_seite := v_seite + 1;
    if v_r.objekt_id = any (v_gesehen) then v_fehler := 'DOPPELT ' || v_r.objekt_id::text; exit; end if;
    v_gesehen := v_gesehen || v_r.objekt_id;
    v_at := v_r.entschieden_am; v_id := v_r.objekt_id;
    exit when v_ex3 = any (v_gesehen) and v_ex1 = any (v_gesehen) and v_ex2 = any (v_gesehen);
  end loop;
  insert into t_res values ('04_blaettern_tie_break',
    case when v_fehler = '' and v_ex1 = any (v_gesehen) and v_ex2 = any (v_gesehen) and v_ex3 = any (v_gesehen)
              and not (v_ex_offen = any (v_gesehen)) and not (v_ex_abgelehnt = any (v_gesehen))
         then 'ok' else 'FEHLER ' || v_fehler || ' gesehen=' || cardinality(v_gesehen)::text end
    || ' nach ' || v_seite::text || ' Seiten (je 1 Zeile, zwei Testzeilen mit gleichem Zeitpunkt)');
  -- Cursor-Gegenprobe: ab dem **ersten** Testeintrag der Seite kommen die übrigen, der erste selbst nicht wieder
  select f.entschieden_am, f.objekt_id into v_at, v_id from freigabe_verlauf('reisekosten', 50) f where f.objekt_id in (v_ex1, v_ex2) order by f.entschieden_am desc, f.objekt_id desc limit 1;
  select count(*) into v_n from freigabe_verlauf('reisekosten', 50, v_at, v_id) f where f.objekt_id = v_id;
  insert into t_res values ('04_cursor_schliesst_sich_selbst_aus', case when v_n = 0 then 'ok' else 'FEHLER ' || v_n::text end);
  -- Deckel und Untergrenze
  select count(*) into v_n from freigabe_verlauf('hotel', 1000);
  insert into t_res values ('04_deckel_50', case when v_n = 50 then 'ok (50 von mindestens 62)' else 'FEHLER ' || v_n::text end);
  -- Blättern über den Deckel hinweg: ab der 50. Zeile kommen die übrigen (mindestens 12), ohne die ersten 50 noch einmal
  select f.entschieden_am, f.objekt_id into v_at, v_id from freigabe_verlauf('hotel', 50) f order by f.entschieden_am asc, f.objekt_id asc limit 1;
  select count(*) into v_n from freigabe_verlauf('hotel', 50, v_at, v_id);
  insert into t_res values ('04_deckel_zweite_seite', case when v_n >= 12 then 'ok' else 'FEHLER ' || v_n::text end);
  select count(*) into v_n from freigabe_verlauf('hotel', 0);
  insert into t_res values ('04_untergrenze_1', case when v_n = 1 then 'ok' else 'FEHLER ' || v_n::text end);
  -- halber Cursor, unbekannte Art
  begin perform * from freigabe_verlauf('hotel', 20, v_t, null); insert into t_res values ('04_halber_cursor', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('04_halber_cursor', 'rejected ' || sqlstate || ' ' || sqlerrm); end;
  begin perform * from freigabe_verlauf('hotel', 20, null, v_ho1); insert into t_res values ('04_halber_cursor_id', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('04_halber_cursor_id', 'rejected ' || sqlstate || ' ' || sqlerrm); end;
  begin perform * from freigabe_verlauf('tickets', 20); insert into t_res values ('04_unbekannte_art', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('04_unbekannte_art', 'rejected ' || sqlstate || ' ' || sqlerrm); end;
  begin perform * from freigabe_verlauf(null, 20); insert into t_res values ('04_art_null', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('04_art_null', 'rejected ' || sqlstate); end;
  -- ohne Anmeldung
  perform set_config('request.jwt.claims', '{}', true);
  begin perform * from freigabe_verlauf('hotel', 20); insert into t_res values ('04_ohne_anmeldung', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('04_ohne_anmeldung', 'rejected ' || sqlstate); end;

  -- === 05 · Form ================================================================================================
  insert into t_res values ('05_keine_email_spalte', (select case when pg_get_function_result(p.oid) ~* 'mail' then 'FEHLER ' || pg_get_function_result(p.oid) else 'ok' end
                                                         from pg_proc p where p.proname = 'freigabe_verlauf'));
  insert into t_res values ('05_definer_stable_search_path', (select 'definer=' || p.prosecdef::text || ' stable=' || (p.provolatile = 's')::text
                                                                || ' search_path=' || coalesce(array_to_string(p.proconfig, ','), 'FEHLT')
                                                              from pg_proc p where p.proname = 'freigabe_verlauf'));
  insert into t_res values ('05_execute_rechte', 'anon=' || has_function_privilege('anon', 'freigabe_verlauf(text,integer,timestamptz,uuid)', 'execute')::text
                                              || ' authenticated=' || has_function_privilege('authenticated', 'freigabe_verlauf(text,integer,timestamptz,uuid)', 'execute')::text);
end $$;
select * from t_res order by step;
rollback;

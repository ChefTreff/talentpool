-- Smoke-Test v6_shuttle_sperre (Vorschlag, LEAD-065 / K-64): ab dem Zeitpunkt der Frist `shuttle_lock_from` gehen Shuttle-Anfragen und -Stornierungen nicht mehr
-- aus dem Portal — nur noch über das Speaker-Team. Mit echtem Rollenwechsel: die handelnde Person ist ein Konto aus dem Bestand, dessen Beziehung zum Speaker
-- je Schritt wechselt (der Speaker selbst, Assistenz, Stage Lead als Betreuer, Team in drei Rollen, Fremde); die Funktionen prüfen `current_person_id()`, also die
-- echte Entscheidung. Jede Abweisung hat ein Gegenstück (vor dem Zeitpunkt, ohne Frist, Team, andere Edition). Die Migration legt die Frist je Edition mit dem
-- Datum 31.12.2099 an (Schritt 00); der Test setzt sie je Schritt neu — alles in der Transaktion; Wegwerfdaten (ZZ …), alles wird zurückgerollt.
-- Erwartung je Schritt als Muster in `t_erw`; `99_auswertung` am Ende.
--   00 Der Seed: eine Systemfrist je Edition (Zielgruppe Speaker, nicht eigen, beschriftet, Datum 2099) — und damit nichts gesperrt.
--   01 Form: EXECUTE (nur `shuttle_lock_status` für `authenticated`, `anon` nie), die Helfer intern, STABLE/DEFINER, `request_shuttle`/`cancel_shuttle` weiter ausführbar.
--   02 Ohne Frist keine Sperre; 03 eine Frist in der Zukunft sperrt nicht (der Zeitpunkt steht trotzdem im Stand).
--   04 Der Speaker selbst ist nach dem Zeitpunkt gesperrt — Anfrage **und** Stornierung (P0001 `shuttle_locked`, `detail` = Zeitpunkt in der Zeit der Veranstaltung,
--      im Winter und im Sommer richtig); die Sperre antwortet vor der Eingabeprüfung; eine Fahrt wurde nicht angelegt, die Buchung nicht storniert.
--   05 Assistenz und 06 Stage Lead (als Betreuer) sind ebenso gesperrt; 07 das Team (admin, Bereichsleitung Speaker, Programm-Team) nicht — Anfrage, Stornierung
--      und `locked = false` im Stand; 08 die finale Freigabe `confirm_shuttle` bleibt möglich.
--   09 Eine Frist einer anderen Edition sperrt nicht. 10 `shuttle_lock_status`: Rechte (Fremde, unbekannte Id auch für das Team: 42501; ohne Anmeldung 28000) und
--      der Kontakt (zugeordneter Kontakt, sonst Standard, ohne Kontakt leer, leere Nummer wird NULL).
--   11 Die Rolle `authenticated`: Stand lesbar, Anfrage gesperrt, die Helfer sind nicht aufrufbar. 12 Nur lesend und ohne Protokoll: weder der Stand noch ein abgewiesener
--      Versuch schreibt etwas. 13 Ohne Sperre gelten die bisherigen Regeln unverändert (Pflichtfelder, höchstens fünf Fahrten).
-- Probelauf der Build-Session am 09.10.2026 gegen die Live-Datenbank nach 0296 (`sh scripts/db.sh dry-run`, alles zurückgerollt): 15 von 15 Erwartungen erfüllt.
-- Mutationsproben an der Migration (35, je Regel eine — Fristschlüssel und -edition, die Grenze „genau jetzt“, NULL ohne Frist, Zeitzone und Format des Textes, die Sperre in
-- beiden Funktionen, die Ausnahme für das Team, die Reihenfolge der Prüfungen, Recht und Anmeldung des Stands, die Wahl des Kontakts, Helfer intern, Härtung, der Seed): alle 35 rot.
-- Der Nachbartest `v6_shuttle` liefert mit und ohne die Migration dieselben 16 Zeilen. `fn-diff`: vier neue Funktionen (drei intern), zwei geänderte (`request_shuttle`,
-- `cancel_shuttle`: je ein eingefügter Block, nichts entfernt).
begin;
create temp table t_res (step text, result text) on commit drop;
create temp table t_erw (step text, muster text) on commit drop;
insert into t_erw values
  ('00_seed', '^ok editionen=[0-9]+ geseedet=[0-9]+ gleich=true system_speaker_2099=true gesperrt=false beschriftet=true$'),
  ('01_form', '^ok status_authenticated=true status_anon=false helfer_intern=true definer_stable=true request_cancel_ausfuehrbar=true$'),
  ('02_ohne_frist', '^ok fahrt=ok storno=ok locked=false lock_from_leer=true intern_gesperrt=false$'),
  ('03_zukunft', '^ok fahrt=ok locked=false lock_from_gesetzt=true intern_gesperrt=false frist_jetzt_gesperrt=true$'),
  ('04_speaker_gesperrt', '^ok fahrt=P0001 shuttle_locked \| 2026-01-15 09:00 storno=P0001 shuttle_locked \| 2026-01-15 09:00 locked=true sommer=2026-07-01 09:00 leere_eingabe=P0001 shuttle_locked storno_schon_storniert=P0001 shuttle_locked keine_fahrt=true nicht_storniert=true$'),
  ('05_assistenz_gesperrt', '^ok fahrt=P0001 shuttle_locked storno=P0001 shuttle_locked locked=true$'),
  ('06_stage_lead_gesperrt', '^ok fahrt=P0001 shuttle_locked storno=P0001 shuttle_locked locked=true betreuer=true$'),
  ('07_team_frei', '^ok admin=ok area_lead_speaker=ok programme_team=ok storno=ok locked=false lock_from_gesetzt=true$'),
  ('08_freigabe', '^ok confirmed$'),
  ('09_andere_edition', '^ok frist_nur_in_anderer_edition=ok frist_zukunft_hier=ok locked=false$'),
  ('10_status_rechte', '^ok fremde=42501 not allowed unbekannt=42501 not allowed team_unbekannt=42501 not allowed ohne_anmeldung=28000 not authenticated fahrt_fremde=42501 not allowed$'),
  ('10_kontakt', '^ok zugeordnet=ZZ Lead/\+49 40 5551234/zz-lead@chef-treff\.de standard=ZZ Standard/\+49 40 5550000/zz-standard@chef-treff\.de ohne_kontakt=NULL$'),
  ('11_rolle_authenticated', '^ok status=true anfrage=P0001 shuttle_locked helfer_gesperrt=42501 helfer_text_gesperrt=42501$'),
  ('12_nur_lesend', '^ok audit_gleich=true buchungen_gleich=true$'),
  ('13_ohne_sperre_wie_bisher', '^ok pflichtfelder=22023 fields_required limit=P0001 shuttle_limit$');

-- Hilfen: Aufruf als Text (`ok` oder `SQLSTATE meldung | detail`), Rollen wechseln, neuer Speaker mit Person, Adresse und Profil.
create function pg_temp.fahrt(p_profil uuid, p_data jsonb default null) returns text language plpgsql as $$
declare v_d text;
begin
  perform request_shuttle(p_profil, coalesce(p_data, jsonb_build_object(
    'passenger_name', 'ZZ Gast', 'pickup_at', '2027-04-16T10:00:00+02:00', 'pickup_location', 'ZZ Flughafen', 'dropoff_location', 'ZZ Hotel')));
  return 'ok';
exception when others then
  get stacked diagnostics v_d = pg_exception_detail;
  return sqlstate || ' ' || sqlerrm || coalesce(' | ' || nullif(v_d, ''), '');
end $$;

create function pg_temp.storno(p_buchung uuid) returns text language plpgsql as $$
declare v_d text;
begin
  perform cancel_shuttle(p_buchung);
  return 'ok';
exception when others then
  get stacked diagnostics v_d = pg_exception_detail;
  return sqlstate || ' ' || sqlerrm || coalesce(' | ' || nullif(v_d, ''), '');
end $$;

create function pg_temp.zz_rolle(p_person uuid, p_role text, p_scope text default 'global', p_scope_id uuid default null) returns void language plpgsql as $$
begin
  delete from role_assignment where person_id = p_person;
  if p_role is not null then
    insert into role_assignment (person_id, role, scope_type, scope_id) values (p_person, p_role, p_scope, p_scope_id);
  end if;
end $$;

create function pg_temp.neuer_speaker(p_ed uuid, p_by uuid, p_nachname text) returns uuid language plpgsql as $$
declare v_p uuid; v_sp uuid;
begin
  insert into person (first_name, last_name) values ('ZZ', p_nachname) returning id into v_p;
  insert into person_email (person_id, email, is_primary) values (v_p, 'zz-sh-' || lower(p_nachname) || '-' || v_p::text || '@example.com', true);
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, confirmed_at, created_by)
    values (v_p, p_ed, 'panelist', 'confirmed', now(), p_by) returning id into v_sp;
  return v_sp;
end $$;

-- Eine offene Fahrt direkt anlegen (der Weg über `request_shuttle` ist selbst Gegenstand des Tests).
create function pg_temp.buchung(p_profil uuid, p_von uuid) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into shuttle_booking (profile_id, passenger_name, passengers, pickup_at, pickup_location, dropoff_location, created_by)
    values (p_profil, 'ZZ Gast', 1, timestamptz '2027-04-16 10:00:00+02', 'ZZ Flughafen', 'ZZ Hotel', p_von) returning id into v_id;
  return v_id;
end $$;

-- Die Frist `shuttle_lock_from` der Edition auf einen Zeitpunkt setzen (nur in dieser Transaktion).
create function pg_temp.frist(p_ed uuid, p_at timestamptz) returns void language plpgsql as $$
begin
  insert into deadline (edition_id, key, audience, due_at, label_de, label_en, custom)
    values (p_ed, 'shuttle_lock_from', 'speaker', p_at, 'ZZ Shuttle-Sperre', 'ZZ Shuttle lock', false)
    on conflict (edition_id, key) do update set due_at = excluded.due_at;
end $$;

do $$
declare
  v_ed uuid; v_ed2 uuid; v_pid uuid; v_uid uuid; v_email text; v_claims text; v_stage uuid;
  v_so uuid; v_sx uuid; v_sy uuid;
  v_b1 uuid; v_b2 uuid; v_b3 uuid; v_b4 uuid;
  v_c_lead uuid; v_c_std uuid;
  v_r text; v_r2 text; v_r3 text; v_sommer text; v_stornobuchung text; v_fremdfahrt text; v_intern boolean; v_jetzt boolean; v_n integer; v_m integer; v_a1 integer; v_a2 integer; v_bk1 text; v_bk2 text;
  v_locked boolean; v_from timestamptz; v_name text; v_phone text; v_mail text;
begin
  -- Eine Testperson mit Konto, die in der Edition noch **kein** Speaker-Profil hat (sie bekommt unten eines, für den Fall „der Speaker selbst“).
  select e.id into v_ed from event e where e.is_edition order by e.start_date desc limit 1;
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null
     and not exists (select 1 from speaker_profile sp where sp.person_id = p.id and sp.edition_id = v_ed)
   order by p.created_at limit 1;
  if v_pid is null then raise exception 'VORBEDINGUNG: eine Person mit Konto ohne Speaker-Profil in der jüngsten Edition fehlt'; end if;
  select s.id into v_stage from stage s limit 1;
  if v_stage is null then raise exception 'VORBEDINGUNG: keine Bühne im Bestand'; end if;
  v_claims := json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text;
  perform set_config('request.jwt.claims', v_claims, true);

  -- Aufbau: der Speaker selbst (Person v_pid), ein fremder Speaker, ein Speaker einer zweiten Edition; Kontakte der Edition.
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, confirmed_at, created_by)
    values (v_pid, v_ed, 'panelist', 'confirmed', now(), v_pid) returning id into v_so;
  v_sx := pg_temp.neuer_speaker(v_ed, v_pid, 'Fremder');
  insert into event (name, format_tag, slug, is_edition, timezone)
    values ('ZZ Edition 2', 'summit', 'zz-lead065-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8), true, 'Europe/Berlin') returning id into v_ed2;
  v_sy := pg_temp.neuer_speaker(v_ed2, v_pid, 'Andere');
  -- Ein Standardkontakt, den es im Bestand schon gibt, würde die Wahl unbestimmt machen: in dieser Transaktion gibt es nur unseren.
  update edition_contact set is_default = false where edition_id = v_ed and type = 'speaker_lead';
  insert into edition_contact (edition_id, type, display_name, email, phone, is_default)
    values (v_ed, 'speaker_lead', 'ZZ Lead', 'zz-lead@chef-treff.de', '+49 40 5551234', false) returning id into v_c_lead;
  insert into edition_contact (edition_id, type, display_name, email, phone, is_default)
    values (v_ed, 'speaker_lead', 'ZZ Standard', 'zz-standard@chef-treff.de', '+49 40 5550000', true) returning id into v_c_std;
  update speaker_profile set lead_contact_id = v_c_lead where id = v_sx;
  v_b1 := pg_temp.buchung(v_so, v_pid);
  v_b2 := pg_temp.buchung(v_sx, v_pid);
  perform pg_temp.zz_rolle(v_pid, null);

  -- === 00 · Der Seed der Migration ===============================================================================================
  -- Die zweite Edition entstand erst im Aufbau dieses Tests, nach der Migration — gezählt werden die Editionen, die es beim Anwenden schon gab.
  select count(*)::integer into v_n from event e where e.is_edition and e.id <> v_ed2;
  select count(*)::integer into v_m from deadline d
   where d.key = 'shuttle_lock_from' and d.audience = 'speaker' and not d.custom and d.due_at >= timestamptz '2099-12-31 00:00:00+00'
     and d.edition_id in (select e.id from event e where e.is_edition and e.id <> v_ed2);
  v_locked := shuttle_locked(v_so);
  insert into t_res values ('00_seed', 'ok editionen=' || v_n::text || ' geseedet=' || v_m::text || ' gleich=' || (v_n = v_m)::text
    || ' system_speaker_2099=' || (v_m > 0)::text || ' gesperrt=' || v_locked::text
    || ' beschriftet=' || (select coalesce(bool_and(d.label_de <> '' and d.label_en <> '' and d.description_de is not null and d.description_en is not null), false)
                              from deadline d where d.key = 'shuttle_lock_from' and d.edition_id = v_ed)::text);

  -- === 01 · Form ===============================================================================================================
  insert into t_res values ('01_form',
    'ok status_authenticated=' || has_function_privilege('authenticated', 'shuttle_lock_status(uuid)', 'execute')::text
    || ' status_anon=' || has_function_privilege('anon', 'shuttle_lock_status(uuid)', 'execute')::text
    || ' helfer_intern=' || (not exists (select 1 from unnest(array['shuttle_lock_at(uuid)', 'shuttle_locked(uuid)', 'shuttle_lock_text(uuid)']) f
          where has_function_privilege('authenticated', f, 'execute') or has_function_privilege('anon', f, 'execute')))::text
    || ' definer_stable=' || (select bool_and(p.prosecdef and p.provolatile = 's' and p.proconfig::text like '%search_path=public, extensions%') from pg_proc p
          where p.oid in ('shuttle_lock_status(uuid)'::regprocedure, 'shuttle_lock_at(uuid)'::regprocedure, 'shuttle_locked(uuid)'::regprocedure, 'shuttle_lock_text(uuid)'::regprocedure))::text
    || ' request_cancel_ausfuehrbar=' || (has_function_privilege('authenticated', 'request_shuttle(uuid, jsonb)', 'execute') and has_function_privilege('authenticated', 'cancel_shuttle(uuid)', 'execute'))::text);

  -- === 02 · Ohne Frist keine Sperre ==============================================================================================
  delete from deadline where edition_id = v_ed and key = 'shuttle_lock_from';
  v_r := pg_temp.fahrt(v_so);
  v_r2 := pg_temp.storno(v_b1);
  select s.locked, s.lock_from into v_locked, v_from from shuttle_lock_status(v_so) s;
  insert into t_res values ('02_ohne_frist', 'ok fahrt=' || v_r || ' storno=' || v_r2 || ' locked=' || v_locked::text || ' lock_from_leer=' || (v_from is null)::text
    || ' intern_gesperrt=' || shuttle_locked(v_so)::text);

  -- === 03 · Eine Frist in der Zukunft sperrt nicht =====================================================================================
  perform pg_temp.frist(v_ed, now() + interval '1 day');
  v_r := pg_temp.fahrt(v_so);
  select s.locked, s.lock_from into v_locked, v_from from shuttle_lock_status(v_so) s;
  v_intern := shuttle_locked(v_so);
  perform pg_temp.frist(v_ed, now());
  v_jetzt := shuttle_locked(v_so);
  insert into t_res values ('03_zukunft', 'ok fahrt=' || v_r || ' locked=' || v_locked::text || ' lock_from_gesetzt=' || (v_from is not null and v_from > now())::text
    || ' intern_gesperrt=' || v_intern::text || ' frist_jetzt_gesperrt=' || v_jetzt::text);

  -- === 04 · Der Speaker selbst ist nach dem Zeitpunkt gesperrt: Anfrage **und** Stornierung ============================================
  -- 15.01.2026 08:00 UTC = 09:00 in Berlin (Winter); 01.07.2026 07:00 UTC = 09:00 (Sommer). Beides liegt in der Vergangenheit.
  perform pg_temp.frist(v_ed, timestamptz '2026-01-15 08:00:00+00');
  v_b3 := pg_temp.buchung(v_so, v_pid);
  select count(*) into v_n from shuttle_booking where profile_id = v_so;
  v_r := pg_temp.fahrt(v_so);
  v_r2 := pg_temp.storno(v_b3);
  select s.locked into v_locked from shuttle_lock_status(v_so) s;
  v_r3 := pg_temp.fahrt(v_so, '{}'::jsonb);
  v_stornobuchung := pg_temp.storno(v_b1);
  perform pg_temp.frist(v_ed, timestamptz '2026-07-01 07:00:00+00');
  v_sommer := pg_temp.fahrt(v_so);
  insert into t_res values ('04_speaker_gesperrt',
    'ok fahrt=' || v_r || ' storno=' || v_r2 || ' locked=' || v_locked::text
    || ' sommer=' || substr(v_sommer, length('P0001 shuttle_locked | ') + 1)
    || ' leere_eingabe=' || split_part(v_r3, ' | ', 1)
    || ' storno_schon_storniert=' || split_part(v_stornobuchung, ' | ', 1)
    || ' keine_fahrt=' || ((select count(*) from shuttle_booking where profile_id = v_so) = v_n)::text
    || ' nicht_storniert=' || ((select status from shuttle_booking where id = v_b3) = 'requested')::text);
  perform pg_temp.frist(v_ed, timestamptz '2026-01-15 08:00:00+00');

  -- === 05 · Die Assistenz ist ebenso gesperrt ==================================================================================
  update speaker_profile set assistant_person_id = v_pid where id = v_sx;
  v_r := pg_temp.fahrt(v_sx);
  v_r2 := pg_temp.storno(v_b2);
  select s.locked into v_locked from shuttle_lock_status(v_sx) s;
  insert into t_res values ('05_assistenz_gesperrt', 'ok fahrt=' || split_part(v_r, ' | ', 1) || ' storno=' || split_part(v_r2, ' | ', 1) || ' locked=' || v_locked::text);
  update speaker_profile set assistant_person_id = null where id = v_sx;

  -- === 06 · Der Stage Lead (als Betreuer des Speakers) ist ebenso gesperrt ======================================================
  perform pg_temp.zz_rolle(v_pid, 'speaker_manager', 'stage', v_stage);
  v_r := pg_temp.fahrt(v_sx);
  v_r2 := pg_temp.storno(v_b2);
  select s.locked into v_locked from shuttle_lock_status(v_sx) s;
  insert into t_res values ('06_stage_lead_gesperrt', 'ok fahrt=' || split_part(v_r, ' | ', 1) || ' storno=' || split_part(v_r2, ' | ', 1) || ' locked=' || v_locked::text
    || ' betreuer=' || can_manage_speaker(v_sx)::text);

  -- === 07 · Das Team nicht ======================================================================================================
  perform pg_temp.zz_rolle(v_pid, 'admin');
  v_r := pg_temp.fahrt(v_sx);
  perform pg_temp.zz_rolle(v_pid, 'area_lead_speaker');
  v_r2 := pg_temp.fahrt(v_sx);
  perform pg_temp.zz_rolle(v_pid, 'programme_team');
  v_r3 := pg_temp.fahrt(v_sx);
  v_b4 := pg_temp.buchung(v_sx, v_pid);
  perform pg_temp.zz_rolle(v_pid, 'area_lead_speaker');
  select s.locked, s.lock_from into v_locked, v_from from shuttle_lock_status(v_sx) s;
  insert into t_res values ('07_team_frei', 'ok admin=' || v_r || ' area_lead_speaker=' || v_r2 || ' programme_team=' || v_r3 || ' storno=' || pg_temp.storno(v_b4)
    || ' locked=' || v_locked::text || ' lock_from_gesetzt=' || (v_from is not null)::text);

  -- === 08 · Die finale Freigabe bleibt, wie sie war ===============================================================================
  v_b4 := pg_temp.buchung(v_sx, v_pid);
  perform confirm_shuttle(v_b4);
  insert into t_res values ('08_freigabe', 'ok ' || (select status from shuttle_booking where id = v_b4));

  -- === 09 · Eine Frist einer anderen Edition sperrt nicht =========================================================================
  perform pg_temp.zz_rolle(v_pid, null);
  delete from deadline where edition_id = v_ed and key = 'shuttle_lock_from';
  perform pg_temp.frist(v_ed2, timestamptz '2026-01-15 08:00:00+00');
  v_r := pg_temp.fahrt(v_so);
  perform pg_temp.frist(v_ed, now() + interval '1 day');
  v_r2 := pg_temp.fahrt(v_so);
  select s.locked into v_locked from shuttle_lock_status(v_so) s;
  insert into t_res values ('09_andere_edition', 'ok frist_nur_in_anderer_edition=' || v_r || ' frist_zukunft_hier=' || v_r2 || ' locked=' || v_locked::text);

  -- === 10 · Der Stand: Rechte und Kontakt ==========================================================================================
  perform pg_temp.frist(v_ed, timestamptz '2026-01-15 08:00:00+00');
  perform pg_temp.zz_rolle(v_pid, null);
  begin perform * from shuttle_lock_status(v_sx); v_r := 'ALLOWED (BUG)'; exception when others then v_r := sqlstate || ' ' || sqlerrm; end;
  begin perform * from shuttle_lock_status(gen_random_uuid()); v_r2 := 'ALLOWED (BUG)'; exception when others then v_r2 := sqlstate || ' ' || sqlerrm; end;
  perform pg_temp.zz_rolle(v_pid, 'area_lead_speaker');
  begin perform * from shuttle_lock_status(gen_random_uuid()); v_r3 := 'ALLOWED (BUG)'; exception when others then v_r3 := sqlstate || ' ' || sqlerrm; end;
  perform set_config('request.jwt.claims', '', true);
  begin perform * from shuttle_lock_status(v_sx); v_bk1 := 'ALLOWED (BUG)'; exception when others then v_bk1 := sqlstate || ' ' || sqlerrm; end;
  perform set_config('request.jwt.claims', v_claims, true);
  perform pg_temp.zz_rolle(v_pid, null);
  v_fremdfahrt := pg_temp.fahrt(v_sx);
  insert into t_res values ('10_status_rechte', 'ok fremde=' || v_r || ' unbekannt=' || v_r2 || ' team_unbekannt=' || v_r3 || ' ohne_anmeldung=' || v_bk1
    || ' fahrt_fremde=' || split_part(v_fremdfahrt, ' | ', 1));

  perform pg_temp.zz_rolle(v_pid, 'area_lead_speaker');
  select s.contact_name || '/' || coalesce(s.contact_phone, 'NULL') || '/' || coalesce(s.contact_email, 'NULL') into v_r from shuttle_lock_status(v_sx) s;
  select s.contact_name || '/' || coalesce(s.contact_phone, 'NULL') || '/' || coalesce(s.contact_email, 'NULL') into v_r2 from shuttle_lock_status(v_so) s;
  select coalesce(s.contact_name, 'NULL') into v_r3 from shuttle_lock_status(v_sy) s;
  insert into t_res values ('10_kontakt', 'ok zugeordnet=' || v_r || ' standard=' || v_r2 || ' ohne_kontakt=' || v_r3);

  -- === 11 · Die Rolle `authenticated` ================================================================================================
  perform pg_temp.zz_rolle(v_pid, null);
  execute 'set local role authenticated';
  begin
    select s.locked into v_locked from shuttle_lock_status(v_so) s;
    v_r := 'status=' || v_locked::text;
  exception when others then v_r := 'status=' || sqlstate || ' ' || sqlerrm; end;
  begin
    perform request_shuttle(v_so, jsonb_build_object('passenger_name', 'ZZ Gast', 'pickup_at', '2027-04-16T10:00:00+02:00', 'pickup_location', 'ZZ A', 'dropoff_location', 'ZZ B'));
    v_r := v_r || ' anfrage=ALLOWED (BUG)';
  exception when others then v_r := v_r || ' anfrage=' || sqlstate || ' ' || sqlerrm; end;
  begin perform shuttle_locked(v_so); v_r := v_r || ' helfer_gesperrt=ALLOWED (BUG)'; exception when others then v_r := v_r || ' helfer_gesperrt=' || sqlstate; end;
  begin perform shuttle_lock_text(v_so); v_r := v_r || ' helfer_text_gesperrt=ALLOWED (BUG)'; exception when others then v_r := v_r || ' helfer_text_gesperrt=' || sqlstate; end;
  execute 'reset role';
  insert into t_res values ('11_rolle_authenticated', 'ok ' || v_r);

  -- === 12 · Nur lesend und ohne Protokoll ==============================================================================================
  select count(*)::integer into v_a1 from audit_log;
  select md5(string_agg(b::text, '|' order by b.id)) into v_bk1 from shuttle_booking b;
  perform * from shuttle_lock_status(v_so);
  perform pg_temp.fahrt(v_so);
  perform pg_temp.storno(v_b3);
  select count(*)::integer into v_a2 from audit_log;
  select md5(string_agg(b::text, '|' order by b.id)) into v_bk2 from shuttle_booking b;
  insert into t_res values ('12_nur_lesend', 'ok audit_gleich=' || (v_a1 = v_a2)::text || ' buchungen_gleich=' || (v_bk1 = v_bk2)::text);

  -- === 13 · Ohne Sperre gelten die bisherigen Regeln =============================================================================
  delete from deadline where edition_id = v_ed and key = 'shuttle_lock_from';
  v_r := pg_temp.fahrt(v_so, '{}'::jsonb);
  select count(*)::integer into v_n from shuttle_booking where profile_id = v_so and status <> 'cancelled';
  while v_n < 5 loop
    perform pg_temp.buchung(v_so, v_pid);
    v_n := v_n + 1;
  end loop;
  v_r2 := pg_temp.fahrt(v_so);
  insert into t_res values ('13_ohne_sperre_wie_bisher', 'ok pflichtfelder=' || split_part(v_r, ' | ', 1) || ' limit=' || split_part(v_r2, ' | ', 1));
end $$;
insert into t_res
  select '99_auswertung',
         case when count(*) filter (where not z.erfuellt) = 0 then 'ok: alle ' || count(*)::text || ' Erwartungen erfüllt'
              else 'FEHLER: ' || string_agg(z.step, ', ' order by z.step) filter (where not z.erfuellt) end
    from (select e.step, exists (select 1 from t_res r where r.step = e.step and r.result ~ e.muster) as erfuellt from t_erw e) z;
select * from t_res order by step;
rollback;

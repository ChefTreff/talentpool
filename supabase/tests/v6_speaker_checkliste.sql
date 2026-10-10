-- Smoke-Test v6_speaker_checkliste (Vorschlag, SPK-082): ein abgeleitet erledigter Punkt der Speaker-Checkliste lässt sich wieder öffnen und wieder abhaken; die abgeleitete
-- Wahrheit (`speaker_next_steps`) bleibt dabei unberührt. Mit echtem Rollenwechsel: die handelnden Personen sind Wegwerf-Konten (ZZ …, mit eigener `auth_user_id`, `current_person_id()`
-- kommt aus den JWT-Claims) — A die Speakerin, B ihre Assistenz (`assistant_person_id`), C ein Kontakt **mit** Zugang, D ein Kontakt **ohne** Zugang, E eine Fremde, F das Team
-- (`area_lead_speaker`); H hat ein eigenes Profil **ohne** Assistenz und Kontakte (NULL-sicher, Konvention §4). Alles wird zurückgerollt. Erwartung je Schritt als Muster in `t_erw`;
-- `99_auswertung` am Ende. Jede Aktion steht in einer eigenen Anweisung (die Reihenfolge der Nebenwirkungen darf nicht vom Planer abhängen).
--   00 Form: vier Funktionen — `anon` ohne EXECUTE, `authenticated` ja, DEFINER, `search_path` gepinnt. 01 Tabelle: RLS an, keine Rechte für `anon`/`authenticated`, direkter Zugriff
--      42501, nur die sieben Schlüssel von `speaker_next_steps` (jeder davon wird angenommen, ein anderer 23514).
--   02 Vor der Erledigung: alle sieben Punkte offen bzw. nicht anwendbar ⇒ jedes Öffnen wird mit P0001 `step_not_done` (detail = Schlüssel) abgewiesen, es entsteht keine Zeile;
--      Abhaken ohne Zeile ist kein Fehler. 03 Aufbau: bis auf die Präsentation erledigt ⇒ die Präsentation lässt sich nicht öffnen; mit Upload sind alle sieben erledigt.
--   04 Alle sieben öffnen ⇒ jeder steht in der Liste (sortiert), die Zeile nennt die Speakerin; ein zweites Öffnen ändert nichts (Zeitpunkt und Urheber bleiben — `do nothing`);
--      alle sieben wieder abhaken ⇒ Liste leer, keine Zeile, noch einmal abhaken ist ruhig, Zeilen eines anderen Profils bleiben. 05 `speaker_next_steps` ist vorher und nachher **derselbe** Wert (offen = 0).
--   06 Randlage Foto: geöffnet, dann das Foto weg ⇒ der Punkt ist abgeleitet wieder offen, die Zeile zählt nicht (Liste leer, Zeile bleibt), Öffnen ⇒ `step_not_done`;
--      Foto wieder da ⇒ der Punkt steht wieder als geöffnet in der Liste. 07 Randlage Session: ohne Session sind `session_content` und `presentation` nicht anwendbar (`null`) —
--      geöffnete Zeilen zählen nicht, Öffnen ⇒ `step_not_done`; mit Session wieder dabei.
--   08 Lesen: A, B, C und das Team sehen die Liste; D (Kontakt ohne Zugang) und E 42501; ein fremdes Profil ohne Assistenz: E, D, B, C 42501, H (die Speakerin) liest. 09 Schreiben: B und C
--      dürfen (die Zeile nennt sie), das Team 42501, D und E 42501 — auch mit unbekanntem Schlüssel (die Rechte stehen vor der Eingabeprüfung); die Speakerin sieht, was die Assistenz öffnete.
--   10 Eingabe: unbekannter, leerer, fehlender und falsch geschriebener Schlüssel ⇒ 22023 `invalid_step` (auch beim Abhaken); `null` als Wunsch öffnet nicht, es schließt.
--   11 Profil: ohne Angabe gilt das eigene (A) bzw. das der Assistenz (B); ohne eigenes Profil und bei unbekanntem P0002. 12 Ohne Anmeldung 28000, als `anon` 42501.
--   13 Rechte-Angleich: `my_speaker_tasks` und `set_speaker_task_tick` — Kontakt mit Zugang sieht und hakt ab (die Zeile nennt ihn), die Assistenz weiter, die Speakerin weiter;
--      Kontakt ohne Zugang, Fremde und ein fremdes Profil 42501; das Team liest und schreibt nicht (unverändert).
--   14 Löschen: fällt das Profil, fallen die Zeilen (cascade); fällt die handelnde Person, bleibt die Zeile, der Verweis wird leer. 15 Es entsteht kein Audit-Eintrag.
-- Probelauf der Build-Session am 10.10.2026 gegen die Live-Datenbank nach 0302 (`sh scripts/db.sh dry-run`, alles zurückgerollt): 16 von 16 Erwartungen erfüllt. Ohne die Migration
-- (`sh scripts/db.sh test`) bricht der Test ab — die Tabelle gibt es nicht (42P01). Mutationsproben an der Migration (43, je Regel eine — Fremdschlüssel und Löschverhalten, Schlüsselprüfung,
-- RLS und Grants, Primärschlüssel, Filter auf den abgeleiteten Stand, jede Rechtefrage beim Lesen und Schreiben, Reihenfolge der Prüfungen, `do nothing`, Löschen nur des eigenen Profils,
-- `null` öffnet nicht, Urheber, Audit, Härtung, DEFINER, Angleich der Aufgaben-Funktionen): 42 rot; eine gleichwertig — die Rechteprüfung in `my_speaker_step_reopened` ist nicht
-- beobachtbar, weil `speaker_next_steps` dieselben Rechte noch einmal prüft (die doppelte Prüfung bleibt als Tiefenverteidigung). `fn-diff`: zwei Funktionen neu, je angeglichener
-- Funktion genau eine Zeile (`assistant_person_id = v_me` ⇒ `is_speaker_assistant(v_sp.id, v_me)`).
begin;
create temp table t_res (step text, result text) on commit drop;
create temp table t_erw (step text, muster text) on commit drop;
insert into t_erw values
  ('00_form', '^ok reopened\(anon=false auth=true definer=true pfad=true\) set\(anon=false auth=true definer=true pfad=true\) tasks\(anon=false auth=true definer=true pfad=true\) tick\(anon=false auth=true definer=true pfad=true\)$'),
  ('01_tabelle', '^ok rls=true anon_dml=false auth_dml=false direkt=42501 schluessel_check=23514 schluessel_gleich=7/7$'),
  ('02_vor_erledigung', '^ok stand=0000nn0 abgewiesen=7 zeilen=0 abhaken_ohne_zeile=ok liste=-$'),
  ('03_aufbau', '^ok stand=1111101 praesentation=P0001 step_not_done \[presentation\] zeilen=0 stand_danach=1111111 offen=0$'),
  ('04_oeffnen_abhaken', '^ok geoeffnet=7 liste=consents,photo,presentation,profile,session,session_content,ticket urheber=7 unveraendert=7 zu=7 liste_danach=- zeilen=0 nochmal=ok fremde_zeilen=2 fremder_urheber=true$'),
  ('05_wahrheit_unberuehrt', '^ok gleich=true offen_vorher=0 offen_nachher=0 geoeffnet=7$'),
  ('06_randlage_foto', '^ok geoeffnet=photo stand_ohne_foto=0 liste_ohne_foto=- zeile=1 erneut=P0001 step_not_done \[photo\] mit_foto=photo zu=-$'),
  ('07_randlage_session', '^ok geoeffnet=presentation,session,session_content stand_ohne_session=1110nn1 liste_ohne_session=- zeilen=3 inhalt=P0001 step_not_done \[session_content\] wieder=presentation,session,session_content zu=-$'),
  ('08_lesen', '^ok a=ticket b=ticket c=ticket team=ticket d=42501 not allowed e=42501 not allowed fremd_h=- fremd_e=42501 not allowed fremd_d=42501 not allowed fremd_b=42501 not allowed fremd_c=42501 not allowed$'),
  ('09_schreiben', '^ok b=ok von_b=true c=ok von_c=true a_sieht=photo,profile,ticket team=42501 not allowed d=42501 not allowed e=42501 not allowed e_unbekannt=42501 not allowed a_fremd=42501 not allowed fremd_e=42501 not allowed zeilen=3 zu=-$'),
  ('10_eingabe', '^ok unbekannt=22023 invalid_step \[bogus\] leer=22023 invalid_step \[\] fehlt=22023 invalid_step \[null\] schreibweise=22023 invalid_step \[Profile\] beim_abhaken=22023 invalid_step \[bogus\] null_schliesst=ok zeilen=0$'),
  ('11_profil', '^ok a_ohne=ticket b_ohne=ticket e_ohne=P0002 speaker_not_found unbekannt=P0002 speaker_not_found set_unbekannt=P0002 speaker_not_found zu=-$'),
  ('12_anmeldung', '^ok lesen=28000 not authenticated schreiben=28000 not authenticated anon_lesen=42501 anon_schreiben=42501$'),
  ('13_aufgaben', '^ok c_liest=true c_haken=ok von_c=true c_zurueck=ok b_haken=ok von_b=true b_liest=true a_zurueck=ok a_liest=true d_liest=42501 not allowed d_haken=42501 not allowed e_liest=42501 not allowed e_haken=42501 not allowed fremd_c_liest=42501 not allowed fremd_c_haken=42501 not allowed team_liest=true team_haken=42501 not allowed ticks=0$'),
  ('14_loeschen', '^ok profil_weg=0 person_weg_zeile=1 verweis_leer=true$'),
  ('15_kein_audit', '^ok eintraege=0$');

-- Hilfen -----------------------------------------------------------------------------------------------------------------------------------------------------------------------
-- Eine Wegwerf-Person mit eigenem Konto (`person.auth_user_id` verweist auf `auth.users`); ein Profil der Edition (Assistenz optional).
create function pg_temp.person(p_name text) returns uuid language plpgsql as $$
declare v_u uuid := gen_random_uuid(); v_id uuid;
begin
  insert into auth.users (id, email, aud, role) values (v_u, lower(replace(p_name, ' ', '-')) || '@zzcheck.test', 'authenticated', 'authenticated');
  insert into person (first_name, last_name, preferred_language, auth_user_id) values ('Xaver', p_name, 'en', v_u) returning id into v_id;
  return v_id;
end $$;

-- Bewusst **nicht zugesagt** (Pipeline-Voreinstellung): ein zugesagtes Profil bekommt von selbst ein Ticket (Trigger), dann wäre der Punkt „Ticket“ schon am Anfang erledigt.
create function pg_temp.profil(p_person uuid, p_ed uuid, p_assistent uuid) returns uuid language sql as $$
  insert into speaker_profile (person_id, edition_id, speaker_type, assistant_person_id)
  values (p_person, p_ed, 'panelist', p_assistent) returning id
$$;

-- Als diese Person handeln (JWT-Claims); ohne Person: ohne Anmeldung.
create function pg_temp.als(p_person uuid) returns void language plpgsql as $$
begin
  if p_person is null then
    perform set_config('request.jwt.claims', '', true);
  else
    perform set_config('request.jwt.claims',
      json_build_object('sub', (select auth_user_id from person where id = p_person), 'role', 'authenticated')::text, true);
  end if;
end $$;

-- Die Liste lesen: Schlüssel sortiert, `-` für leer, `NULL`, wenn die Funktion NULL liefert, sonst `SQLSTATE meldung`.
create function pg_temp.lesen(p_person uuid, p_profil uuid) returns text language plpgsql as $$
declare v text[];
begin
  perform pg_temp.als(p_person);
  v := my_speaker_step_reopened(p_profil);
  if v is null then return 'NULL'; end if;
  if cardinality(v) = 0 then return '-'; end if;
  return (select string_agg(x, ',' order by x collate "C") from unnest(v) x);
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $$;

-- Öffnen oder abhaken: `ok` oder `SQLSTATE meldung [detail]`.
create function pg_temp.setzen(p_person uuid, p_key text, p_auf boolean, p_profil uuid) returns text language plpgsql as $$
declare v_d text;
begin
  perform pg_temp.als(p_person);
  perform set_speaker_step_reopened(p_key, p_auf, p_profil);
  return 'ok';
exception when others then
  get stacked diagnostics v_d = pg_exception_detail;
  return sqlstate || ' ' || sqlerrm || ' [' || coalesce(v_d, '') || ']';
end $$;

-- Dasselbe ohne die eckige Klammer mit dem Detail (für die Rechtefehler, die keines tragen).
create function pg_temp.kurz(p_text text) returns text language sql immutable as $$
  select regexp_replace(p_text, ' \[.*\]$', '')
$$;

-- Der abgeleitete Stand der sieben Punkte als Zeichenkette: 1 erledigt, 0 offen, n nicht anwendbar (null) — Reihenfolge wie in der Checkliste.
create function pg_temp.stand(p_person uuid, p_profil uuid) returns text language plpgsql as $$
declare v jsonb; k text; s text := '';
begin
  perform pg_temp.als(p_person);
  v := speaker_next_steps(p_profil);
  foreach k in array array['profile', 'photo', 'consents', 'session', 'session_content', 'presentation', 'ticket'] loop
    s := s || case when v ->> k = 'true' then '1' when v ->> k = 'false' then '0' else 'n' end;
  end loop;
  return s;
end $$;

create function pg_temp.offen(p_person uuid, p_profil uuid) returns integer language plpgsql as $$
begin
  perform pg_temp.als(p_person);
  return jsonb_array_length(speaker_next_steps(p_profil) -> 'open');
end $$;

create function pg_temp.zeilen(p_profil uuid) returns integer language sql as $$
  select count(*)::integer from speaker_step_reopen where profile_id = p_profil
$$;

create function pg_temp.von(p_profil uuid, p_key text) returns uuid language sql as $$
  select reopened_by from speaker_step_reopen where profile_id = p_profil and step_key = p_key
$$;

create function pg_temp.form(p_sig text) returns text language sql as $$
  select '(anon=' || has_function_privilege('anon', p_sig, 'execute')::text
      || ' auth=' || has_function_privilege('authenticated', p_sig, 'execute')::text
      || ' definer=' || (select p.prosecdef from pg_proc p where p.oid = p_sig::regprocedure)::text
      || ' pfad=' || (select coalesce(p.proconfig::text, '') like '%search_path=%' from pg_proc p where p.oid = p_sig::regprocedure)::text || ')'
$$;

-- Die Aufgaben des Teams (0149): steht die Testaufgabe in der Liste (`true`/`false`, sonst `SQLSTATE meldung`)?
create function pg_temp.aufgaben_sichtbar(p_person uuid, p_profil uuid) returns text language plpgsql as $$
begin
  perform pg_temp.als(p_person);
  return jsonb_path_exists(my_speaker_tasks(p_profil), '$[*] ? (@.key == "zz_spk082_aufgabe")')::text;
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $$;

-- Haken setzen oder wegnehmen: `ok` oder `SQLSTATE meldung [detail]`.
create function pg_temp.aufgabe_haken(p_person uuid, p_task uuid, p_done boolean, p_profil uuid) returns text language plpgsql as $$
declare v_d text;
begin
  perform pg_temp.als(p_person);
  perform set_speaker_task_tick(p_task, p_done, p_profil);
  return 'ok';
exception when others then
  get stacked diagnostics v_d = pg_exception_detail;
  return sqlstate || ' ' || sqlerrm || ' [' || coalesce(v_d, '') || ']';
end $$;

do $$
declare
  v_ed uuid; v_a uuid; v_b uuid; v_c uuid; v_d uuid; v_e uuid; v_f uuid; v_g uuid; v_h uuid; v_i uuid;
  v_p uuid; v_p2 uuid; v_p3 uuid;
  v_ev uuid; v_day uuid; v_st uuid; v_slot uuid; v_se uuid; v_photo uuid; v_task uuid;
  v_s text; v_r text; v_r2 text; v_r3 text; v_r4 text; v_n integer; v_n2 integer; v_n3 integer; v_n4 integer; v_j jsonb; v_j2 jsonb;
  v_keys text[] := array['profile', 'photo', 'consents', 'session', 'session_content', 'presentation', 'ticket'];
  v_k text;
begin
  -- ---- Aufbau: Personen und Profile. P gehört A (Assistenz B, Kontakt C mit Zugang, Kontakt D ohne Zugang); P3 gehört H (ohne Assistenz, ohne Kontakte); P2 wird gelöscht (Schritt 14).
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  v_a := pg_temp.person('ZZCheck A'); v_b := pg_temp.person('ZZCheck B'); v_c := pg_temp.person('ZZCheck C'); v_d := pg_temp.person('ZZCheck D');
  v_e := pg_temp.person('ZZCheck E'); v_f := pg_temp.person('ZZCheck F'); v_g := pg_temp.person('ZZCheck G'); v_h := pg_temp.person('ZZCheck H'); v_i := pg_temp.person('ZZCheck I');
  v_p := pg_temp.profil(v_a, v_ed, v_b);
  v_p3 := pg_temp.profil(v_h, v_ed, null);
  v_p2 := pg_temp.profil(v_i, v_ed, null);
  insert into speaker_contact (profile_id, kind, person_id, email, has_access, consent_at) values (v_p, 'assistant', v_c, 'zz-spk082-c@example.org', true, current_date);
  insert into speaker_contact (profile_id, kind, person_id, first_name, has_access, consent_at) values (v_p, 'office', v_d, 'ZZ Office', false, current_date);
  insert into role_assignment (person_id, role, scope_type) values (v_f, 'area_lead_speaker', 'global');

  -- ---- 00 Form
  insert into t_res values ('00_form',
    'ok reopened' || pg_temp.form('my_speaker_step_reopened(uuid)') || ' set' || pg_temp.form('set_speaker_step_reopened(text,boolean,uuid)')
    || ' tasks' || pg_temp.form('my_speaker_tasks(uuid)') || ' tick' || pg_temp.form('set_speaker_task_tick(uuid,boolean,uuid)'));

  -- ---- 01 Tabelle: RLS an, keine Rechte, nur die sieben Schlüssel
  execute 'set local role authenticated';
  begin perform count(*) from speaker_step_reopen; v_r := 'ALLOWED (BUG)'; exception when others then v_r := sqlstate; end;
  execute 'reset role';
  begin insert into speaker_step_reopen (profile_id, step_key) values (v_p, 'bogus'); v_r2 := 'ALLOWED (BUG)'; exception when others then v_r2 := sqlstate; end;
  v_n := 0; v_n2 := 0;
  perform pg_temp.als(v_a);
  for v_k in select k from jsonb_object_keys(speaker_next_steps(v_p)) k where k not in ('open', 'hospitality') loop
    v_n := v_n + 1;
    begin insert into speaker_step_reopen (profile_id, step_key) values (v_p, v_k); v_n2 := v_n2 + 1; exception when others then null; end;
  end loop;
  delete from speaker_step_reopen where profile_id = v_p;
  insert into t_res values ('01_tabelle',
    'ok rls=' || (select c.relrowsecurity from pg_class c where c.oid = 'speaker_step_reopen'::regclass)::text
    || ' anon_dml=' || has_table_privilege('anon', 'speaker_step_reopen', 'select,insert,update,delete,truncate,references,trigger')::text
    || ' auth_dml=' || has_table_privilege('authenticated', 'speaker_step_reopen', 'select,insert,update,delete,truncate,references,trigger')::text
    || ' direkt=' || v_r || ' schluessel_check=' || v_r2 || ' schluessel_gleich=' || v_n2 || '/' || v_n);

  -- ---- 02 Vor der Erledigung: nichts ist erledigt (Profil ohne Stellung und Bio, kein Foto, keine Einwilligung, keine Session, kein Ticket) ⇒ nichts lässt sich öffnen
  v_s := 'ok stand=' || pg_temp.stand(v_a, v_p);
  v_n := 0;
  foreach v_k in array v_keys loop
    v_r := pg_temp.setzen(v_a, v_k, true, v_p);
    if v_r = 'P0001 step_not_done [' || v_k || ']' then v_n := v_n + 1; end if;
  end loop;
  v_s := v_s || ' abgewiesen=' || v_n || ' zeilen=' || pg_temp.zeilen(v_p);
  v_r := pg_temp.setzen(v_a, 'photo', false, v_p);
  v_s := v_s || ' abhaken_ohne_zeile=' || v_r;
  v_r := pg_temp.lesen(v_a, v_p);
  insert into t_res values ('02_vor_erledigung', v_s || ' liste=' || v_r);

  -- ---- 03 Aufbau: alles erledigt bis auf die Präsentation (Keynote ohne Upload)
  update speaker_profile set job_title = 'ZZ Job', bio_short_en = 'ZZ Bio' where id = v_p;
  insert into speaker_asset (profile_id, kind, storage_path, filename) values (v_p, 'photo', 'zz-spk082/' || v_p::text || '/photo/zz.jpg', 'zz.jpg') returning id into v_photo;
  update speaker_profile set photo_asset_id = v_photo where id = v_p;
  insert into consent_record (person_id, consent_type, version, granted) values (v_a, 'speaker_release', 'zz1', true), (v_a, 'photo_video', 'zz1', true);
  insert into event (name, format_tag, edition_id, slug, timezone) values ('ZZ Summit', 'summit', v_ed, 'zz-spk082-' || substr(md5(random()::text), 1, 8), 'Europe/Berlin') returning id into v_ev;
  insert into event_day (event_id, day_date) values (v_ev, '2027-04-16') returning id into v_day;
  insert into stage (event_id, name, slug, room) values (v_ev, 'ZZ Main', 'zz-main', 'Saal 1') returning id into v_st;
  insert into slot (stage_id, event_day_id, start_at, end_at) values (v_st, v_day, '2027-04-16 13:00+02', '2027-04-16 13:30+02') returning id into v_slot;
  insert into session (event_id, slot_id, title_de, format, access_mode) values (v_ev, v_slot, 'ZZ Talk', 'keynote', 'open') returning id into v_se;
  insert into session_speaker (session_id, person_id, role, sort_order) values (v_se, v_a, 'speaker', 0);
  update session set description_de = 'ZZ Beschreibung' where id = v_se;
  insert into ticket (event_id, person_id, barcode, status) values (v_ed, v_a, 'ZZ-SPK082-' || gen_random_uuid()::text, 'valid');
  v_s := 'ok stand=' || pg_temp.stand(v_a, v_p);
  v_r := pg_temp.setzen(v_a, 'presentation', true, v_p);
  v_s := v_s || ' praesentation=' || v_r || ' zeilen=' || pg_temp.zeilen(v_p);
  insert into speaker_asset (profile_id, session_id, kind, storage_path, filename) values (v_p, v_se, 'presentation', 'zz-spk082/' || v_p::text || '/presentation/zz.pdf', 'zz.pdf');
  v_r := pg_temp.stand(v_a, v_p);
  v_n := pg_temp.offen(v_a, v_p);
  insert into t_res values ('03_aufbau', v_s || ' stand_danach=' || v_r || ' offen=' || v_n);

  -- ---- 04 Alle sieben öffnen und wieder abhaken — Zeilen eines **anderen** Profils (P3, dieselben Schlüssel) dürfen davon nicht berührt werden
  insert into speaker_step_reopen (profile_id, step_key, reopened_by) values (v_p3, 'photo', v_h), (v_p3, 'ticket', v_h);
  v_n := 0; v_n2 := 0; v_n3 := 0; v_n4 := 0;
  foreach v_k in array v_keys loop
    v_r := pg_temp.setzen(v_a, v_k, true, v_p);
    v_r2 := pg_temp.lesen(v_a, v_p);
    if v_r = 'ok' and v_k = any (string_to_array(v_r2, ',')) then v_n := v_n + 1; end if;
    if pg_temp.von(v_p, v_k) = v_a then v_n2 := v_n2 + 1; end if;
    -- Zeitpunkt und Urheber von Hand zurücksetzen: ein zweites Öffnen darf beides nicht anfassen (on conflict do nothing).
    update speaker_step_reopen set reopened_at = '2020-01-01 00:00+00', reopened_by = v_g where profile_id = v_p and step_key = v_k;
    v_r := pg_temp.setzen(v_a, v_k, true, v_p);
    if v_r = 'ok' and pg_temp.von(v_p, v_k) = v_g
       and (select r.reopened_at from speaker_step_reopen r where r.profile_id = v_p and r.step_key = v_k) = '2020-01-01 00:00+00' then v_n3 := v_n3 + 1; end if;
  end loop;
  v_r2 := pg_temp.lesen(v_a, v_p);
  foreach v_k in array v_keys loop
    v_r := pg_temp.setzen(v_a, v_k, false, v_p);
    if v_r = 'ok' then v_n4 := v_n4 + 1; end if;
  end loop;
  v_s := 'ok geoeffnet=' || v_n || ' liste=' || v_r2 || ' urheber=' || v_n2 || ' unveraendert=' || v_n3 || ' zu=' || v_n4;
  v_r := pg_temp.lesen(v_a, v_p);
  v_s := v_s || ' liste_danach=' || v_r || ' zeilen=' || pg_temp.zeilen(v_p);
  v_r := pg_temp.setzen(v_a, 'photo', false, v_p);
  v_s := v_s || ' nochmal=' || v_r || ' fremde_zeilen=' || pg_temp.zeilen(v_p3) || ' fremder_urheber=' || (pg_temp.von(v_p3, 'photo') = v_h and pg_temp.von(v_p3, 'ticket') = v_h)::text;
  delete from speaker_step_reopen where profile_id = v_p3;
  insert into t_res values ('04_oeffnen_abhaken', v_s);

  -- ---- 05 Die abgeleitete Wahrheit bleibt unberührt
  perform pg_temp.als(v_a);
  v_j := speaker_next_steps(v_p);
  v_n := pg_temp.offen(v_a, v_p);
  foreach v_k in array v_keys loop v_r := pg_temp.setzen(v_a, v_k, true, v_p); end loop;
  perform pg_temp.als(v_a);
  v_j2 := speaker_next_steps(v_p);
  v_n2 := pg_temp.offen(v_a, v_p);
  insert into t_res values ('05_wahrheit_unberuehrt',
    'ok gleich=' || (v_j = v_j2)::text || ' offen_vorher=' || v_n || ' offen_nachher=' || v_n2 || ' geoeffnet=' || pg_temp.zeilen(v_p));
  foreach v_k in array v_keys loop v_r := pg_temp.setzen(v_a, v_k, false, v_p); end loop;

  -- ---- 06 Randlage Foto: geöffnet, dann ist das Foto weg ⇒ der Punkt ist abgeleitet wieder offen, die Zeile zählt nicht
  v_r := pg_temp.setzen(v_a, 'photo', true, v_p);
  v_s := 'ok geoeffnet=' || pg_temp.lesen(v_a, v_p);
  update speaker_profile set photo_asset_id = null where id = v_p;
  v_r := pg_temp.stand(v_a, v_p);
  v_s := v_s || ' stand_ohne_foto=' || substr(v_r, 2, 1);
  v_r := pg_temp.lesen(v_a, v_p);
  v_s := v_s || ' liste_ohne_foto=' || v_r || ' zeile=' || pg_temp.zeilen(v_p);
  v_r := pg_temp.setzen(v_a, 'photo', true, v_p);
  v_s := v_s || ' erneut=' || v_r;
  update speaker_profile set photo_asset_id = v_photo where id = v_p;
  v_r := pg_temp.lesen(v_a, v_p);
  v_s := v_s || ' mit_foto=' || v_r;
  v_r := pg_temp.setzen(v_a, 'photo', false, v_p);
  v_r2 := pg_temp.lesen(v_a, v_p);
  insert into t_res values ('06_randlage_foto', v_s || ' zu=' || v_r2);

  -- ---- 07 Randlage Session: ohne Session sind Inhalt und Präsentation nicht anwendbar (null) ⇒ geöffnete Zeilen zählen nicht
  v_r := pg_temp.setzen(v_a, 'session', true, v_p);
  v_r := pg_temp.setzen(v_a, 'session_content', true, v_p);
  v_r := pg_temp.setzen(v_a, 'presentation', true, v_p);
  v_s := 'ok geoeffnet=' || pg_temp.lesen(v_a, v_p);
  delete from session_speaker where session_id = v_se and person_id = v_a;
  v_r := pg_temp.stand(v_a, v_p);
  v_s := v_s || ' stand_ohne_session=' || v_r;
  v_r := pg_temp.lesen(v_a, v_p);
  v_s := v_s || ' liste_ohne_session=' || v_r || ' zeilen=' || pg_temp.zeilen(v_p);
  v_r := pg_temp.setzen(v_a, 'session_content', true, v_p);
  v_s := v_s || ' inhalt=' || v_r;
  insert into session_speaker (session_id, person_id, role, sort_order) values (v_se, v_a, 'speaker', 0);
  v_r := pg_temp.lesen(v_a, v_p);
  v_s := v_s || ' wieder=' || v_r;
  foreach v_k in array v_keys loop v_r := pg_temp.setzen(v_a, v_k, false, v_p); end loop;
  v_r := pg_temp.lesen(v_a, v_p);
  insert into t_res values ('07_randlage_session', v_s || ' zu=' || v_r);

  -- ---- 08 Lesen: eine Zeile (ticket) als Grundlage; A, B, C, Team sehen sie, D und E nicht; ein fremdes Profil ohne Assistenz (P3) liest nur H
  v_r := pg_temp.setzen(v_a, 'ticket', true, v_p);
  v_s := 'ok a=' || pg_temp.lesen(v_a, v_p);
  v_s := v_s || ' b=' || pg_temp.lesen(v_b, v_p);
  v_s := v_s || ' c=' || pg_temp.lesen(v_c, v_p);
  v_s := v_s || ' team=' || pg_temp.lesen(v_f, v_p);
  v_s := v_s || ' d=' || pg_temp.lesen(v_d, v_p);
  v_s := v_s || ' e=' || pg_temp.lesen(v_e, v_p);
  v_s := v_s || ' fremd_h=' || pg_temp.lesen(v_h, v_p3);
  v_s := v_s || ' fremd_e=' || pg_temp.lesen(v_e, v_p3);
  v_s := v_s || ' fremd_d=' || pg_temp.lesen(v_d, v_p3);
  v_s := v_s || ' fremd_b=' || pg_temp.lesen(v_b, v_p3);
  v_s := v_s || ' fremd_c=' || pg_temp.lesen(v_c, v_p3);
  insert into t_res values ('08_lesen', v_s);

  -- ---- 09 Schreiben: B und C dürfen, das Team nicht, D und E nicht (auch nicht mit unbekanntem Schlüssel); A auf einem fremden Profil nicht
  v_s := 'ok b=' || pg_temp.setzen(v_b, 'profile', true, v_p);
  v_s := v_s || ' von_b=' || (pg_temp.von(v_p, 'profile') = v_b)::text;
  v_s := v_s || ' c=' || pg_temp.setzen(v_c, 'photo', true, v_p);
  v_s := v_s || ' von_c=' || (pg_temp.von(v_p, 'photo') = v_c)::text;
  v_s := v_s || ' a_sieht=' || pg_temp.lesen(v_a, v_p);
  v_s := v_s || ' team=' || pg_temp.kurz(pg_temp.setzen(v_f, 'consents', true, v_p));
  v_s := v_s || ' d=' || pg_temp.kurz(pg_temp.setzen(v_d, 'consents', true, v_p));
  v_s := v_s || ' e=' || pg_temp.kurz(pg_temp.setzen(v_e, 'consents', true, v_p));
  v_s := v_s || ' e_unbekannt=' || pg_temp.kurz(pg_temp.setzen(v_e, 'bogus', true, v_p));
  v_s := v_s || ' a_fremd=' || pg_temp.kurz(pg_temp.setzen(v_a, 'profile', true, v_p3));
  v_s := v_s || ' fremd_e=' || pg_temp.kurz(pg_temp.setzen(v_e, 'profile', true, v_p3));
  v_s := v_s || ' zeilen=' || pg_temp.zeilen(v_p);
  v_r := pg_temp.setzen(v_a, 'profile', false, v_p);
  v_r := pg_temp.setzen(v_a, 'photo', false, v_p);
  v_r := pg_temp.setzen(v_a, 'ticket', false, v_p);
  insert into t_res values ('09_schreiben', v_s || ' zu=' || pg_temp.lesen(v_a, v_p));

  -- ---- 10 Eingabe
  v_r := pg_temp.setzen(v_a, 'ticket', true, v_p);
  v_s := 'ok unbekannt=' || pg_temp.setzen(v_a, 'bogus', true, v_p);
  v_s := v_s || ' leer=' || pg_temp.setzen(v_a, '', true, v_p);
  v_s := v_s || ' fehlt=' || pg_temp.setzen(v_a, null, true, v_p);
  v_s := v_s || ' schreibweise=' || pg_temp.setzen(v_a, 'Profile', true, v_p);
  v_s := v_s || ' beim_abhaken=' || pg_temp.setzen(v_a, 'bogus', false, v_p);
  v_s := v_s || ' null_schliesst=' || pg_temp.setzen(v_a, 'ticket', null, v_p);
  insert into t_res values ('10_eingabe', v_s || ' zeilen=' || pg_temp.zeilen(v_p));

  -- ---- 11 Profil: ohne Angabe das eigene bzw. das der Assistenz; ohne eigenes Profil oder unbekannt P0002
  v_r := pg_temp.setzen(v_a, 'ticket', true, v_p);
  v_s := 'ok a_ohne=' || pg_temp.lesen(v_a, null);
  v_s := v_s || ' b_ohne=' || pg_temp.lesen(v_b, null);
  v_s := v_s || ' e_ohne=' || pg_temp.lesen(v_e, null);
  v_s := v_s || ' unbekannt=' || pg_temp.lesen(v_a, gen_random_uuid());
  v_s := v_s || ' set_unbekannt=' || pg_temp.kurz(pg_temp.setzen(v_a, 'ticket', true, gen_random_uuid()));
  v_r := pg_temp.setzen(v_a, 'ticket', false, null);
  insert into t_res values ('11_profil', v_s || ' zu=' || pg_temp.lesen(v_a, v_p));

  -- ---- 12 Anmeldung und Rolle `anon`
  v_r := pg_temp.lesen(null, v_p);
  v_r2 := pg_temp.kurz(pg_temp.setzen(null, 'ticket', true, v_p));
  perform pg_temp.als(v_a);
  execute 'set local role anon';
  begin perform my_speaker_step_reopened(v_p); v_r3 := 'ALLOWED (BUG)'; exception when others then v_r3 := sqlstate; end;
  begin perform set_speaker_step_reopened('ticket', true, v_p); v_r4 := 'ALLOWED (BUG)'; exception when others then v_r4 := sqlstate; end;
  execute 'reset role';
  insert into t_res values ('12_anmeldung', 'ok lesen=' || v_r || ' schreiben=' || v_r2 || ' anon_lesen=' || v_r3 || ' anon_schreiben=' || v_r4);

  -- ---- 13 Rechte-Angleich: Aufgaben des Teams (my_speaker_tasks, set_speaker_task_tick)
  insert into speaker_task (edition_id, key, label_de, label_en) values (v_ed, 'zz_spk082_aufgabe', 'ZZ Aufgabe', 'ZZ Task') returning id into v_task;
  v_s := 'ok c_liest=' || pg_temp.aufgaben_sichtbar(v_c, v_p);
  v_s := v_s || ' c_haken=' || pg_temp.aufgabe_haken(v_c, v_task, true, v_p);
  v_s := v_s || ' von_c=' || coalesce((select (tk.done_by = v_c)::text from speaker_task_tick tk where tk.task_id = v_task and tk.profile_id = v_p), 'NULL');
  v_s := v_s || ' c_zurueck=' || pg_temp.aufgabe_haken(v_c, v_task, false, v_p);
  v_s := v_s || ' b_haken=' || pg_temp.aufgabe_haken(v_b, v_task, true, v_p);
  v_s := v_s || ' von_b=' || coalesce((select (tk.done_by = v_b)::text from speaker_task_tick tk where tk.task_id = v_task and tk.profile_id = v_p), 'NULL');
  v_s := v_s || ' b_liest=' || pg_temp.aufgaben_sichtbar(v_b, v_p);
  v_s := v_s || ' a_zurueck=' || pg_temp.aufgabe_haken(v_a, v_task, false, v_p);
  v_s := v_s || ' a_liest=' || pg_temp.aufgaben_sichtbar(v_a, v_p);
  v_s := v_s || ' d_liest=' || pg_temp.aufgaben_sichtbar(v_d, v_p);
  v_s := v_s || ' d_haken=' || pg_temp.kurz(pg_temp.aufgabe_haken(v_d, v_task, true, v_p));
  v_s := v_s || ' e_liest=' || pg_temp.aufgaben_sichtbar(v_e, v_p);
  v_s := v_s || ' e_haken=' || pg_temp.kurz(pg_temp.aufgabe_haken(v_e, v_task, true, v_p));
  v_s := v_s || ' fremd_c_liest=' || pg_temp.aufgaben_sichtbar(v_c, v_p3);
  v_s := v_s || ' fremd_c_haken=' || pg_temp.kurz(pg_temp.aufgabe_haken(v_c, v_task, true, v_p3));
  v_s := v_s || ' team_liest=' || pg_temp.aufgaben_sichtbar(v_f, v_p);
  v_s := v_s || ' team_haken=' || pg_temp.kurz(pg_temp.aufgabe_haken(v_f, v_task, true, v_p));
  insert into t_res values ('13_aufgaben', v_s || ' ticks=' || (select count(*) from speaker_task_tick tk where tk.task_id = v_task)::text);

  -- ---- 14 Löschen: Profil weg ⇒ Zeilen weg (cascade); Person weg ⇒ Zeile bleibt, Verweis leer
  insert into speaker_step_reopen (profile_id, step_key, reopened_by) values (v_p2, 'profile', v_i);
  delete from speaker_profile where id = v_p2;
  v_n := pg_temp.zeilen(v_p2);
  insert into speaker_step_reopen (profile_id, step_key, reopened_by) values (v_p, 'ticket', v_g);
  delete from person where id = v_g;
  insert into t_res values ('14_loeschen',
    'ok profil_weg=' || v_n || ' person_weg_zeile=' || pg_temp.zeilen(v_p) || ' verweis_leer=' || (pg_temp.von(v_p, 'ticket') is null)::text);

  -- ---- 15 Kein Audit-Eintrag von irgendeiner dieser Personen
  insert into t_res values ('15_kein_audit',
    'ok eintraege=' || (select count(*) from audit_log a where a.actor_person_id in (v_a, v_b, v_c, v_d, v_e, v_f, v_h))::text);
end $$;
insert into t_res
  select '99_auswertung',
         case when count(*) filter (where not z.erfuellt) = 0 then 'ok: alle ' || count(*)::text || ' Erwartungen erfüllt'
              else 'FEHLER: ' || string_agg(z.step, ', ' order by z.step) filter (where not z.erfuellt) end
    from (select e.step, exists (select 1 from t_res r where r.step = e.step and r.result ~ e.muster) as erfuellt from t_erw e) z;
select * from t_res order by step;
rollback;

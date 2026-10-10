-- Smoke-Test (Tischvorgabe für die Bewerbungsfragen: `partner_copy_table_questions`, PART-150).
-- Nummer offen. Wegwerf-Organisationen, -Tische, -Gespräche und -Katalogfragen, echte Partnerrolle des angemeldeten Kontos, alles zurückgerollt.
-- Aufbau wie echte Zeilen: zwei Tische einer Organisation (T1 mit sechs Gesprächen, T2 mit zwei), ein Tisch einer fremden Organisation; die Quelle (Gespräch
-- 1 an T1) trägt eine Frage des Teams, zwei wählbare Katalogfragen (A mit Pflicht, B), eine **inaktive** wählbare Frage, eine **freigegebene** und eine
-- **offene** eigene Frage; die Ziele sind gestaffelt (anderer Stand, eine gleiche offene eigene Frage, eine fremde eigene Frage). Belegt:
--   01 Übernahme auf zwei Gespräche: Rückgabe 2; Katalogwahl gespiegelt (vorhandene Frage behält Pflicht und Platz, die nicht gewählte weg, die neue hinten,
--      die Frage des Teams bleibt, die inaktive wandert nicht mit); die freigegebene eigene Frage kommt freigegeben an, die offene offen; die gleiche offene
--      Frage im zweiten Ziel zieht auf freigegeben nach (und wird nicht doppelt angelegt); die Quelle selbst bleibt unverändert;
--   02 eine zweite Übernahme schreibt nichts (Rückgabe 0, gleiche Zeilen);
--   03 Audit: genau eine Zeile je Aufruf, Objekt `stage` mit dem Tisch, genau die fünf Schlüssel, keine Texte oder Personen;
--   04 zwei eigene Fragen im Ziel: P0001 `too_many_questions` mit dem Zielgespräch als `detail`, und **alles** rollt zurück — auch das, was am selben Gespräch
--      schon geschrieben war (Katalogwahl, erste Kopie), und die Gespräche davor; kein Audit beim Fehler;
--   05 `not_same_table` mit dem Gespräch als `detail`: anderer Tisch, fremde Organisation, abgesagt, anderes Format, Quelle als Ziel; auch eine abgesagte
--      Quelle — und es steht danach in keinem Gespräch eine Zeile mehr als vorher;
--   06 Recht: Quelle einer fremden Organisation 42501; ohne Anmeldung 28000;
--   07 kein Ziel, doppelt viele Ziele (201), unbekanntes Ziel oder unbekannte Quelle `session_not_found`;
--   08 eine eigene Zeile des Teams (ohne `requested_by`) im Ziel bleibt, zählt aber zur Grenze von zwei; die Kopie kommt freigegeben dazu;
--   09 Bewerbungen und Antworten bleiben unberührt, auch wenn die Katalogfrage, auf die sie antworten, im Ziel wegfällt;
--   10 SECURITY DEFINER, fester search_path, `authenticated` darf, `anon` nicht;
--   11 „gleich“ heißt gleich in **allen** Inhaltsfeldern (Text, Text englisch, Typ, Optionen, Zweck — je ein Ziel, das sich in genau einem unterscheidet) und
--      „von der Partnerin“: eine gleiche Zeile des Teams nimmt die Kopie nicht auf; eine eigene Zeile des Teams an der Quelle wandert nicht mit;
--   99 Summe: jeder Schritt oben endet auf „(richtig)“ — eine andere Zeile ist ein Befund.
-- Probelauf Bau-Chat 10.10.2026 (`sh scripts/db.sh dry-run`): **42/42 grün** (`99_summe`: „alle 42 Schritte richtig“). Gegenproben auf die Funktion: 37 Mutationen
-- (Recht, Tisch- und Organisationsprüfung, Katalogwahl, Gleichheit je Inhaltsfeld, Freigabe, Grenze, Audit, Rückgabe …), 36 vom Test erkannt; die übrige ist
-- gleichwertig: das `coalesce` um `partner_can_edit` ändert nichts, solange `partner_roles` nie NULL liefert (es fängt ein künftiges NULL ab).
begin;
create temp table t_res (step text, result text) on commit drop;

-- Die Fragen eines Gesprächs als eine Zeichenkette: Katalogfragen mit Schlüssel, eigene mit Text und Freigabe, je Pflicht und Platz.
create function pg_temp.satz(p_s uuid) returns text language sql stable as $f$
  select string_agg(case when sq.question_id is not null then qc.key
                         else 'eigen:' || sq.label_de || ':' || (sq.approved_at is not null)::text end
                    || ':' || sq.required::text || ':' || sq.sort_order::text, ',' order by sq.sort_order, sq.label_de nulls first, sq.id)
    from session_question sq left join question_catalog qc on qc.id = sq.question_id
   where sq.session_id = p_s
$f$;

do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_summit uuid; v_day uuid; v_start timestamptz;
  v_org uuid; v_fremd uuid; v_t1 uuid; v_t2 uuid; v_tf uuid;
  v_s1 uuid; v_s2 uuid; v_s3 uuid; v_s4 uuid; v_s5 uuid; v_s5b uuid; v_s5c uuid; v_s6 uuid; v_s7 uuid; v_s8 uuid; v_sf uuid;
  v_t3 uuid; v_u0 uuid; v_u uuid[] := '{}'; v_k integer; v_other uuid;
  v_team uuid; v_a uuid; v_b uuid; v_c uuid; v_d uuid; v_ziel uuid;
  v_opts jsonb := '[{"key":"ja","label_de":"Ja","label_en":"Yes"},{"key":"nein","label_de":"Nein","label_en":"No"}]'::jsonb;
  v_ret integer; v_txt text; v_txt2 text; v_n integer; v_n2 integer; v_detail text; v_keys text; v_after jsonb; v_ant jsonb; v_name text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null limit 1;
  if v_pid is null then raise exception 'VORBEDINGUNG: keine Person mit Konto'; end if;
  delete from role_assignment where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select e.id into v_summit from event e where e.edition_id = v_ed order by e.start_date limit 1;
  select ed.id into v_day from event_day ed where ed.event_id = v_summit order by ed.sort_order limit 1;
  if v_day is null then raise exception 'VORBEDINGUNG: Summit ohne Tag'; end if;
  select (ed.day_date + time '09:00') at time zone 'Europe/Berlin' into v_start from event_day ed where ed.id = v_day;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- Aufbau mit Teamrecht; danach ist das Konto nur noch Kontakt der Organisation.
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  insert into organization (legal_name) values ('ZZ Tischfragen GmbH') returning id into v_org;
  insert into organization (legal_name) values ('ZZ Fremde Tischfragen GmbH') returning id into v_fremd;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited'), (v_fremd, v_ed, 'invited');
  insert into stage (event_id, name, type, partner_org_id, active) values (v_summit, 'ZZ Tisch 1', 'interview_table', v_org, true) returning id into v_t1;
  insert into stage (event_id, name, type, partner_org_id, active) values (v_summit, 'ZZ Tisch 2', 'interview_table', v_org, true) returning id into v_t2;
  insert into stage (event_id, name, type, partner_org_id, active) values (v_summit, 'ZZ Fremder Tisch', 'interview_table', v_fremd, true) returning id into v_tf;
  perform upsert_partner_contact(v_org, v_email, 'Test', 'Person', '{primary_ops}');
  -- Eine andere Person (nur als Fremdschlüssel): sie hat die Frage an der Quelle von Tisch 2 beantragt, die Kopie trägt dagegen die Person dieses Aufrufs.
  select p.id into v_other from person p where p.id <> v_pid order by p.id limit 1;
  if v_other is null then raise exception 'VORBEDINGUNG: keine zweite Person'; end if;

  v_s1  := partner_create_session(v_org,   'interview_table', v_t1, v_day, v_start,                        v_start + interval '20 minutes',  'ZZ Gespraech 1', 1, '{}'::jsonb, v_ed);
  v_s2  := partner_create_session(v_org,   'interview_table', v_t1, v_day, v_start + interval '30 minutes',  v_start + interval '50 minutes',  'ZZ Gespraech 2', 1, '{}'::jsonb, v_ed);
  v_s3  := partner_create_session(v_org,   'interview_table', v_t1, v_day, v_start + interval '60 minutes',  v_start + interval '80 minutes',  'ZZ Gespraech 3', 1, '{}'::jsonb, v_ed);
  v_s4  := partner_create_session(v_org,   'interview_table', v_t1, v_day, v_start + interval '90 minutes',  v_start + interval '110 minutes', 'ZZ Gespraech 4', 1, '{}'::jsonb, v_ed);
  v_s6  := partner_create_session(v_org,   'interview_table', v_t1, v_day, v_start + interval '120 minutes', v_start + interval '140 minutes', 'ZZ Gespraech 6 abgesagt', 1, '{}'::jsonb, v_ed);
  v_s7  := partner_create_session(v_org,   'interview_table', v_t1, v_day, v_start + interval '150 minutes', v_start + interval '170 minutes', 'ZZ Gespraech 7 anderes Format', 1, '{}'::jsonb, v_ed);
  v_s5  := partner_create_session(v_org,   'interview_table', v_t2, v_day, v_start,                        v_start + interval '20 minutes',  'ZZ Gespraech T2-1', 1, '{}'::jsonb, v_ed);
  v_s5b := partner_create_session(v_org,   'interview_table', v_t2, v_day, v_start + interval '30 minutes',  v_start + interval '50 minutes',  'ZZ Gespraech T2-2', 1, '{}'::jsonb, v_ed);
  v_sf  := partner_create_session(v_fremd, 'interview_table', v_tf, v_day, v_start,                        v_start + interval '20 minutes',  'ZZ Fremdes Gespraech', 1, '{}'::jsonb, v_ed);
  v_s5c := partner_create_session(v_org,   'interview_table', v_t2, v_day, v_start + interval '60 minutes',  v_start + interval '80 minutes',  'ZZ Gespraech T2-3', 1, '{}'::jsonb, v_ed);
  -- Ein Gespräch **am selben Tisch**, das aber einer fremden Organisation gehört: damit prüft die Organisation für sich, nicht der Tisch.
  v_s8  := partner_create_session(v_org,   'interview_table', v_t1, v_day, v_start + interval '180 minutes', v_start + interval '200 minutes', 'ZZ Gespraech 8 fremde Organisation', 1, '{}'::jsonb, v_ed);
  update session set partner_org_id = v_fremd, host_org_id = v_fremd where id = v_s8;
  -- Tisch 3: eine Quelle und sechs Ziele, je mit **einer** eigenen Zeile, die sich in genau einem Inhaltsfeld von der Quellfrage unterscheidet (das sechste: sie ist vom Team).
  insert into stage (event_id, name, type, partner_org_id, active) values (v_summit, 'ZZ Tisch 3', 'interview_table', v_org, true) returning id into v_t3;
  v_u0 := partner_create_session(v_org, 'interview_table', v_t3, v_day, v_start, v_start + interval '20 minutes', 'ZZ Gespraech T3-0', 1, '{}'::jsonb, v_ed);
  for v_k in 1..6 loop
    v_u := v_u || partner_create_session(v_org, 'interview_table', v_t3, v_day, v_start + (v_k * 30) * interval '1 minute',
                                         v_start + (v_k * 30 + 20) * interval '1 minute', 'ZZ Gespraech T3-' || v_k, 1, '{}'::jsonb, v_ed);
  end loop;
  update session set publish_status = 'cancelled' where id = v_s6;
  update session set format = 'side_event' where id = v_s7;
  delete from role_assignment where person_id = v_pid and role = 'admin';

  insert into question_catalog (key, label_de, label_en, type, active, sort_order, partner_selectable)
    values ('zz_tf_team', 'ZZ Teamfrage', 'ZZ Team question', 'textarea', true, 910, false) returning id into v_team;
  insert into question_catalog (key, label_de, label_en, type, active, sort_order, partner_selectable)
    values ('zz_tf_a', 'ZZ Frage A', 'ZZ Question A', 'text', true, 911, true) returning id into v_a;
  insert into question_catalog (key, label_de, label_en, type, active, sort_order, partner_selectable)
    values ('zz_tf_b', 'ZZ Frage B', 'ZZ Question B', 'text', true, 912, true) returning id into v_b;
  insert into question_catalog (key, label_de, label_en, type, active, sort_order, partner_selectable)
    values ('zz_tf_c', 'ZZ Frage C', 'ZZ Question C', 'text', true, 913, true) returning id into v_c;
  insert into question_catalog (key, label_de, label_en, type, active, sort_order, partner_selectable)
    values ('zz_tf_d', 'ZZ Frage D inaktiv', 'ZZ Question D inactive', 'text', false, 914, true) returning id into v_d;

  -- Quelle (Gespräch 1): Teamfrage (Pflicht), A (Pflicht), B, die inaktive D; eine freigegebene und eine offene eigene Frage.
  insert into session_question (session_id, question_id, required, sort_order) values
    (v_s1, v_team, true, 1), (v_s1, v_a, true, 2), (v_s1, v_b, false, 3), (v_s1, v_d, false, 4);
  insert into session_question (session_id, label_de, label_en, type, required, sort_order, purpose, requested_by, approved_by, approved_at)
    values (v_s1, 'ZZ Eigene Frage 1', 'ZZ Own question 1', 'text', false, 90, 'ZZ Zweck 1', v_pid, v_pid, now() - interval '1 day');
  insert into session_question (session_id, label_de, label_en, type, options, required, sort_order, purpose, requested_by)
    values (v_s1, 'ZZ Eigene Frage 2', null, 'select', v_opts, false, 91, 'ZZ Zweck 2', v_pid);
  -- Ziel 2: A ohne Pflicht an anderem Platz, C (in der Quelle nicht gewählt), B fehlt, keine eigenen Fragen.
  insert into session_question (session_id, question_id, required, sort_order) values
    (v_s2, v_team, true, 1), (v_s2, v_a, false, 5), (v_s2, v_c, true, 6);
  -- Ziel 3: Katalog wie die Quelle; die erste eigene Frage steht schon da — gleich in allen Feldern, aber noch offen.
  insert into session_question (session_id, question_id, required, sort_order) values
    (v_s3, v_team, true, 1), (v_s3, v_a, true, 2), (v_s3, v_b, false, 3);
  insert into session_question (session_id, label_de, label_en, type, required, sort_order, purpose, requested_by)
    values (v_s3, 'ZZ Eigene Frage 1', 'ZZ Own question 1', 'text', false, 90, 'ZZ Zweck 1', v_pid);
  -- Ziel 4: eine eigene Frage, die nicht die der Quelle ist — die zweite Kopie sprengt die Grenze von zwei.
  insert into session_question (session_id, question_id, required, sort_order) values (v_s4, v_team, true, 1);
  insert into session_question (session_id, label_de, type, required, sort_order, purpose, requested_by, approved_by, approved_at)
    values (v_s4, 'ZZ Fremde Frage X', 'text', false, 90, 'ZZ Zweck X', v_pid, v_pid, now());
  -- Tisch 2: eine freigegebene eigene Frage an der Quelle; Ziel b hat schon eine **andere** eigene Frage des Partners, Ziel c eine eigene Zeile des **Teams**
  -- (ohne `requested_by`).
  insert into session_question (session_id, label_de, type, required, sort_order, purpose, requested_by, approved_by, approved_at)
    values (v_s5, 'ZZ Eigene Frage T2', 'text', false, 90, 'ZZ Zweck T2', v_other, v_pid, now() - interval '2 days');
  insert into session_question (session_id, label_de, type, required, sort_order, purpose, requested_by, approved_by, approved_at)
    values (v_s5b, 'ZZ Fremde Frage X2', 'text', false, 90, 'ZZ Zweck X2', v_pid, v_pid, now() - interval '4 days');
  insert into session_question (session_id, label_de, type, required, sort_order, approved_by, approved_at)
    values (v_s5c, 'ZZ Frage des Teams (frei)', 'text', false, 50, v_pid, now() - interval '3 days');
  -- Tisch 3: die Quelle und sechs Ziele, die sich je in einem Feld unterscheiden (Text, Text englisch, Typ, Optionen, Zweck; das sechste ist eine Zeile des Teams).
  insert into session_question (session_id, label_de, label_en, type, options, required, sort_order, purpose, requested_by, approved_by, approved_at)
    values (v_u0, 'ZZ Quelle Frage', 'ZZ Source question', 'select', v_opts, false, 90, 'ZZ Quellzweck', v_pid, v_pid, now() - interval '5 days');
  -- Dazu eine eigene Zeile des **Teams** an der Quelle: sie gehört nicht zur Vorgabe des Partners und wandert nicht mit (sonst hätte jedes Ziel drei).
  insert into session_question (session_id, label_de, type, required, sort_order, approved_by, approved_at)
    values (v_u0, 'ZZ Teamfrage frei T3', 'text', false, 50, v_pid, now() - interval '6 days');
  insert into session_question (session_id, label_de, label_en, type, options, required, sort_order, purpose, requested_by) values
    (v_u[1], 'ZZ Quelle Frage anders', 'ZZ Source question', 'select', v_opts, false, 90, 'ZZ Quellzweck', v_pid),
    (v_u[2], 'ZZ Quelle Frage', 'ZZ Source question anders', 'select', v_opts, false, 90, 'ZZ Quellzweck', v_pid),
    (v_u[3], 'ZZ Quelle Frage', 'ZZ Source question', 'textarea', v_opts, false, 90, 'ZZ Quellzweck', v_pid),
    (v_u[4], 'ZZ Quelle Frage', 'ZZ Source question', 'select', '[{"key":"vielleicht","label_de":"Vielleicht","label_en":"Maybe"}]'::jsonb, false, 90, 'ZZ Quellzweck', v_pid),
    (v_u[5], 'ZZ Quelle Frage', 'ZZ Source question', 'select', v_opts, false, 90, 'ZZ Anderer Zweck', v_pid);
  -- Ziel 6: eine Zeile des **Teams** (ohne `requested_by`), in allen Feldern wie die Quellfrage — sie ist keine Frage des Partners und nimmt die Kopie nicht auf.
  insert into session_question (session_id, label_de, label_en, type, options, required, sort_order, purpose)
    values (v_u[6], 'ZZ Quelle Frage', 'ZZ Source question', 'select', v_opts, false, 90, 'ZZ Quellzweck');
  -- Eine Bewerbung auf Ziel 2, die auf die Katalogfrage C antwortet (C fällt im Ziel weg).
  insert into application (session_id, person_id, answers) values (v_s2, v_pid, jsonb_build_object(v_c::text, 'ZZ Antwort auf C'));
  select a.answers into v_ant from application a where a.session_id = v_s2 and a.person_id = v_pid;

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  if not partner_can_edit(v_org) then raise exception 'VORBEDINGUNG: Konto darf die Organisation nicht bearbeiten'; end if;
  if partner_can_edit(v_fremd) then raise exception 'VORBEDINGUNG: Konto darf die fremde Organisation bearbeiten'; end if;
  v_txt2 := pg_temp.satz(v_s1);

  -- 01 Übernahme auf Gespräch 2 und 3
  v_ret := partner_copy_table_questions(v_s1, array[v_s2, v_s3]);
  v_txt := pg_temp.satz(v_s2);
  insert into t_res values ('01a_ziel_2',
    case when v_ret = 2 and v_txt = 'zz_tf_team:true:1,zz_tf_a:false:5,zz_tf_b:false:6,eigen:ZZ Eigene Frage 1:true:false:90,eigen:ZZ Eigene Frage 2:false:false:91'
         then 'Rückgabe 2; A behält Platz 5 ohne Pflicht, C weg, B hinten, Teamfrage bleibt, Frage 1 freigegeben, Frage 2 offen (richtig)'
         else 'unerwartet: ' || v_ret || ' / ' || coalesce(v_txt, 'leer') end);
  v_txt := pg_temp.satz(v_s3);
  insert into t_res values ('01b_ziel_3',
    case when v_txt = 'zz_tf_team:true:1,zz_tf_a:true:2,zz_tf_b:false:3,eigen:ZZ Eigene Frage 1:true:false:90,eigen:ZZ Eigene Frage 2:false:false:91'
         then 'die gleiche offene Frage 1 zog auf freigegeben nach, Frage 2 kam offen dazu, Katalog unverändert (richtig)'
         else 'unerwartet: ' || coalesce(v_txt, 'leer') end);
  select count(*)::integer into v_n from session_question where session_id = v_s3 and label_de = 'ZZ Eigene Frage 1';
  insert into t_res values ('01c_keine_doppelte',
    case when v_n = 1 then 'die gleiche Frage wurde nicht ein zweites Mal angelegt (richtig)' else 'ALLOWED (BUG): ' || v_n || ' Zeilen' end);
  insert into t_res values ('01d_quelle_unveraendert',
    case when pg_temp.satz(v_s1) = v_txt2 then 'die Quelle blieb, wie sie war (richtig)' else 'BUG: Quelle geändert: ' || coalesce(pg_temp.satz(v_s1), 'leer') end);
  select count(*)::integer into v_n from session_question where session_id in (v_s2, v_s3) and question_id = v_d;
  insert into t_res values ('01e_inaktive_bleibt_weg',
    case when v_n = 0 then 'die inaktive Frage D ist in keinem Ziel gelandet (richtig)' else 'ALLOWED (BUG): D übernommen' end);
  select count(*)::integer into v_n from session_question where session_id = v_s2 and question_id = v_c;
  insert into t_res values ('01f_nicht_gewaehlte_weg',
    case when v_n = 0 then 'die nicht gewählte Katalogfrage C ist aus Gespräch 2 weg (richtig)' else 'BUG: C steht noch da' end);

  -- 02 Wiederholung: nichts zu schreiben
  select count(*)::integer into v_n from session_question where session_id in (v_s2, v_s3);
  v_txt := pg_temp.satz(v_s2) || '|' || pg_temp.satz(v_s3);
  v_ret := partner_copy_table_questions(v_s1, array[v_s2, v_s3]);
  select count(*)::integer into v_n2 from session_question where session_id in (v_s2, v_s3);
  insert into t_res values ('02_wiederholung',
    case when v_ret = 0 and v_n = v_n2 and v_txt = pg_temp.satz(v_s2) || '|' || pg_temp.satz(v_s3) then 'Rückgabe 0, gleiche Zeilen (richtig)'
         else 'unerwartet: Rückgabe ' || v_ret || ', Zeilen ' || v_n || ' → ' || v_n2 end);

  -- 03 Audit: eine Zeile je Aufruf, fünf Schlüssel, keine Texte
  select count(*)::integer into v_n from audit_log where action = 'partner.table_questions' and object_id = v_t1::text;
  insert into t_res values ('03a_eine_zeile_je_aufruf',
    case when v_n = 2 then 'zwei Aufrufe, zwei Zeilen — nicht eine je Gespräch (richtig)' else 'unerwartet: ' || v_n || ' Zeilen' end);
  select a.after, a.object_type into v_after, v_name from audit_log a
   where a.action = 'partner.table_questions' and a.object_id = v_t1::text order by a.id limit 1;
  select string_agg(k, ',' order by k) into v_keys from jsonb_object_keys(v_after) k;
  insert into t_res values ('03b_schluessel',
    case when v_name = 'stage' and v_keys = 'catalog,from_session,own,own_approved,sessions'
              and (v_after->>'sessions')::integer = 2 and (v_after->>'catalog')::integer = 2
              and (v_after->>'own')::integer = 2 and (v_after->>'own_approved')::integer = 2
              and (v_after->>'from_session') = v_s1::text
         then 'Objekt stage, Schlüssel catalog/from_session/own/own_approved/sessions, Werte 2/2/2/2 (richtig)'
         else 'unerwartet: ' || coalesce(v_name, 'null') || ' ' || coalesce(v_keys, 'null') || ' ' || coalesce(v_after::text, 'null') end);
  select (a.after->>'sessions')::integer into v_n from audit_log a
   where a.action = 'partner.table_questions' and a.object_id = v_t1::text order by a.id desc limit 1;
  insert into t_res values ('03b2_sessions_sind_geaenderte',
    case when v_n = 0 then 'die zweite Zeile (nichts zu schreiben) nennt 0 Gespräche (richtig)' else 'unerwartet: sessions = ' || coalesce(v_n::text, 'null') end);
  insert into t_res values ('03c_keine_personen',
    case when v_after::text !~* '(@|ZZ Eigene|ZZ Zweck|Test Person)' then 'weder Adresse noch Fragetext noch Name im Audit (richtig)'
         else 'BUG: Klartext im Audit: ' || v_after::text end);

  -- 04 Zu viele eigene Fragen im vierten Gespräch: alles rollt zurück
  delete from session_question where session_id = v_s2 and question_id = v_b;  -- Gespräch 2 weicht wieder ab
  v_txt := pg_temp.satz(v_s4);
  begin
    perform partner_copy_table_questions(v_s1, array[v_s2, v_s3, v_s4]);
    insert into t_res values ('04a_zu_viele', 'ALLOWED (BUG): drei eigene Fragen im Gespräch 4');
  exception
    when sqlstate 'P0001' then
      get stacked diagnostics v_detail = pg_exception_detail;
      insert into t_res values ('04a_zu_viele',
        case when sqlerrm = 'too_many_questions' and v_detail = v_s4::text then 'too_many_questions, detail = Gespräch 4 (richtig)'
             else 'P0001 ' || sqlerrm || ' / ' || coalesce(v_detail, 'null') end);
    when others then insert into t_res values ('04a_zu_viele', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;
  insert into t_res values ('04b_gespraech_4_unveraendert',
    case when pg_temp.satz(v_s4) = v_txt then 'Gespräch 4 blieb, wie es war — Katalogwahl und erste Kopie sind zurückgerollt (richtig)'
         else 'BUG: Gespräch 4 geändert: ' || coalesce(pg_temp.satz(v_s4), 'leer') end);
  select count(*)::integer into v_n from session_question where session_id = v_s2 and question_id = v_b;
  insert into t_res values ('04c_gespraech_2_unveraendert',
    case when v_n = 0 then 'auch Gespräch 2 blieb ohne Frage B — der Aufruf ist atomar (richtig)'
         else 'BUG: Gespräch 2 wurde trotz des Fehlers geändert' end);
  select count(*)::integer into v_n from audit_log where action = 'partner.table_questions' and object_id = v_t1::text;
  insert into t_res values ('04d_kein_audit_bei_fehler',
    case when v_n = 2 then 'der gescheiterte Aufruf hat kein Audit hinterlassen (richtig)' else 'BUG: ' || v_n || ' Audit-Zeilen' end);

  -- 05 Nicht derselbe Tisch
  select count(*)::integer into v_n from session_question where session_id in (v_s1, v_s2, v_s3, v_s4, v_s5, v_s5b, v_s5c, v_sf, v_s6, v_s7, v_s8);
  for v_name, v_ziel in
    select * from (values ('anderer_tisch', v_s5), ('fremde_organisation', v_sf), ('fremde_organisation_gleicher_tisch', v_s8),
                          ('abgesagt', v_s6), ('anderes_format', v_s7), ('quelle_als_ziel', v_s1)) as x(n, id)
  loop
    begin
      perform partner_copy_table_questions(v_s1, array[v_s2, v_ziel]);
      insert into t_res values ('05_' || v_name, 'ALLOWED (BUG)');
    exception
      when sqlstate 'P0001' then
        get stacked diagnostics v_detail = pg_exception_detail;
        insert into t_res values ('05_' || v_name,
          case when sqlerrm = 'not_same_table' and v_detail = v_ziel::text then 'not_same_table, detail = das Gespräch (richtig)'
               else 'P0001 ' || sqlerrm || ' / ' || coalesce(v_detail, 'null') end);
      when others then insert into t_res values ('05_' || v_name, 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
    end;
  end loop;
  begin  -- eine abgesagte Quelle gehört zu keinem Tisch mehr
    perform partner_copy_table_questions(v_s6, array[v_s2]);
    insert into t_res values ('05y_quelle_abgesagt', 'ALLOWED (BUG)');
  exception
    when sqlstate 'P0001' then insert into t_res values ('05y_quelle_abgesagt', case when sqlerrm = 'not_same_table' then 'not_same_table (richtig)' else 'P0001 ' || sqlerrm end);
    when others then insert into t_res values ('05y_quelle_abgesagt', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;
  select count(*)::integer into v_n2 from session_question where session_id in (v_s1, v_s2, v_s3, v_s4, v_s5, v_s5b, v_s5c, v_sf, v_s6, v_s7, v_s8);
  insert into t_res values ('05z_nichts_geschrieben',
    case when v_n = v_n2 then 'keiner der Fehlversuche hat eine Zeile geschrieben (richtig)' else 'BUG: ' || v_n || ' → ' || v_n2 || ' Zeilen' end);

  -- 06 Recht: Quelle einer fremden Organisation; ohne Anmeldung
  begin
    perform partner_copy_table_questions(v_sf, array[v_s2]);
    insert into t_res values ('06a_fremde_quelle', 'ALLOWED (BUG)');
  exception
    when sqlstate '42501' then insert into t_res values ('06a_fremde_quelle', '42501 (richtig)');
    when others then insert into t_res values ('06a_fremde_quelle', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  begin
    perform partner_copy_table_questions(v_s1, array[v_s2]);
    insert into t_res values ('06b_ohne_anmeldung', 'ALLOWED (BUG)');
  exception
    when sqlstate '28000' then insert into t_res values ('06b_ohne_anmeldung', '28000 (richtig)');
    when others then insert into t_res values ('06b_ohne_anmeldung', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 07 Kein Ziel, zu viele Ziele, unbekannte Gespräche
  for v_name, v_ret in select * from (values ('kein_ziel', 0), ('null_ziel', 1), ('201_ziele', 201)) as x(n, k) loop
    begin
      perform partner_copy_table_questions(v_s1,
        case v_ret when 0 then '{}'::uuid[] when 1 then null::uuid[]
                   else (select array_agg(gen_random_uuid()) from generate_series(1, 201)) end);
      insert into t_res values ('07_' || v_name, 'ALLOWED (BUG)');
    exception
      when sqlstate '22023' then insert into t_res values ('07_' || v_name, '22023 (richtig)');
      when others then insert into t_res values ('07_' || v_name, 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
    end;
  end loop;
  begin
    perform partner_copy_table_questions(v_s1, array[v_s2, gen_random_uuid()]);
    insert into t_res values ('07_unbekanntes_ziel', 'ALLOWED (BUG)');
  exception
    when sqlstate 'P0002' then insert into t_res values ('07_unbekanntes_ziel', case when sqlerrm = 'session_not_found' then 'session_not_found (richtig)' else 'P0002 ' || sqlerrm end);
    when others then insert into t_res values ('07_unbekanntes_ziel', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;
  begin
    perform partner_copy_table_questions(gen_random_uuid(), array[v_s2]);
    insert into t_res values ('07_unbekannte_quelle', 'ALLOWED (BUG)');
  exception
    when sqlstate 'P0002' then insert into t_res values ('07_unbekannte_quelle', case when sqlerrm = 'session_not_found' then 'session_not_found (richtig)' else 'P0002 ' || sqlerrm end);
    when others then insert into t_res values ('07_unbekannte_quelle', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 08 Tisch 2: eine andere eigene Frage des Partners im Ziel bleibt (nie gelöscht), die eigene Zeile des Teams bleibt und zählt zur Grenze
  v_ret := partner_copy_table_questions(v_s5, array[v_s5b, v_s5c]);
  select count(*)::integer into v_n from session_question sq
   where sq.session_id = v_s5b and sq.question_id is null and sq.requested_by is not null;
  select count(*)::integer into v_n2 from session_question sq
   where sq.session_id = v_s5b and sq.label_de = 'ZZ Fremde Frage X2' and sq.approved_at is not null and sq.purpose = 'ZZ Zweck X2';
  insert into t_res values ('08a_andere_eigene_bleibt',
    case when v_ret = 2 and v_n = 2 and v_n2 = 1 then 'die andere eigene Frage X2 blieb unverändert, die Kopie kam dazu (richtig)'
         else 'unerwartet: Rückgabe ' || v_ret || ', eigene Zeilen ' || v_n || ', X2 unverändert ' || v_n2 end);
  select string_agg(sq.label_de || ':' || coalesce(sq.requested_by::text, 'team') || ':' || (sq.approved_at is not null)::text, ',' order by sq.sort_order, sq.id)
    into v_txt from session_question sq where sq.session_id = v_s5c;
  insert into t_res values ('08b_team_zeile_bleibt',
    case when v_txt = 'ZZ Frage des Teams (frei):team:true,ZZ Eigene Frage T2:' || v_pid::text || ':true'
         then 'Zeile des Teams unberührt, Kopie freigegeben mit dem Anfragenden dieses Aufrufs (richtig)'
         else 'unerwartet: ' || coalesce(v_txt, 'leer') end);
  insert into session_question (session_id, label_de, type, required, sort_order, purpose, requested_by)
    values (v_s5, 'ZZ Zweite Eigene T2', 'text', false, 91, 'ZZ Zweck T2b', v_pid);
  begin  -- die Zeile des Teams zählt: zwei eigene Zeilen stehen schon, die dritte Kopie wäre zu viel
    perform partner_copy_table_questions(v_s5, array[v_s5c]);
    insert into t_res values ('08c_team_zeile_zaehlt', 'ALLOWED (BUG)');
  exception
    when sqlstate 'P0001' then
      get stacked diagnostics v_detail = pg_exception_detail;
      insert into t_res values ('08c_team_zeile_zaehlt',
        case when sqlerrm = 'too_many_questions' and v_detail = v_s5c::text then 'too_many_questions, detail = das Ziel (richtig)'
             else 'P0001 ' || sqlerrm || ' / ' || coalesce(v_detail, 'null') end);
    when others then insert into t_res values ('08c_team_zeile_zaehlt', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 11 „Gleich“ heißt: gleich in **allen** Inhaltsfeldern. Jedes Ziel hat eine eigene Frage, die sich in genau einem Feld unterscheidet — sie darf die
  --    Quellfrage nicht aufnehmen (sonst fehlte die Kopie und die offene Frage würde freigegeben, die der Partner nie beantragt hat).
  v_ret := partner_copy_table_questions(v_u0, v_u);
  for v_k in 1..6 loop
    select count(*)::integer into v_n from session_question sq where sq.session_id = v_u[v_k] and sq.question_id is null;
    select count(*)::integer into v_n2 from session_question sq where sq.session_id = v_u[v_k] and sq.question_id is null and sq.approved_at is not null;
    insert into t_res values ('11_' || (array['label_de', 'label_en', 'type', 'options', 'purpose', 'team_zeile'])[v_k],
      case when v_n = 2 and v_n2 = 1 then 'die abweichende Frage blieb offen, die Kopie kam freigegeben dazu (richtig)'
           else 'BUG: ' || v_n || ' eigene Zeilen, ' || v_n2 || ' freigegeben — das Feld zählt nicht zur Gleichheit' end);
  end loop;
  insert into t_res values ('11z_rueckgabe', case when v_ret = 6 then 'Rückgabe 6 (richtig)' else 'unerwartet: ' || v_ret end);

  -- 09 Antworten bleiben stehen
  select count(*)::integer into v_n from application a where a.session_id = v_s2 and a.person_id = v_pid and a.answers = v_ant;
  insert into t_res values ('09_antworten_bleiben',
    case when v_n = 1 then 'Bewerbung und Antwort auf die entfernte Katalogfrage C unverändert (richtig)' else 'BUG: Bewerbung verändert oder weg' end);
end $$;

insert into t_res
select '10_rechte',
       case when not p.prosecdef then 'BUG: nicht SECURITY DEFINER'
            when not coalesce(p.proconfig::text like '%search_path=public, extensions%', false) then 'BUG: search_path nicht fest'
            when not has_function_privilege('authenticated', p.oid, 'execute') then 'BUG: authenticated darf nicht'
            when has_function_privilege('anon', p.oid, 'execute') then 'ALLOWED (BUG): anon'
            else 'SECURITY DEFINER, search_path fest, authenticated ja, anon nein (richtig)' end
  from pg_proc p
 where p.oid = 'partner_copy_table_questions(uuid, uuid[])'::regprocedure;

insert into t_res
select '99_summe',
       case when count(*) filter (where result !~ 'richtig|Vorbedingung stimmt') = 0 then 'alle ' || count(*) || ' Schritte richtig'
            else 'BEFUND: ' || count(*) filter (where result !~ 'richtig|Vorbedingung stimmt') || ' von ' || count(*) || ' Schritten nicht richtig' end
  from t_res where step <> '99_summe';

select * from t_res order by step;
rollback;

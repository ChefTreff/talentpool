-- Test zu `v6_fristen_je_bereich` (ADM-099). Belegt (mit ZZTEST-Fristen in einer vorhandenen Edition):
--   01 Rechte je Zielgruppe (Rollen-Probe): area_lead_partner ändert/legt Partner-Fristen an, nicht Speaker-Fristen (42501) und nicht
--      award/all; programme_team Speaker; admin alles; production_team ohne Recht ⇒ 42501;
--   02 eigene Frist: Schlüssel `custom_<slug>` erzeugt (Umlaute, Sonderzeichen), zweite mit gleicher Beschriftung bekommt `_2`,
--      custom = true; fehlende Beschriftung, Datum oder Edition ⇒ 22023 / P0002;
--   03 Systemfrist: Zielgruppe fest (deadline_is_system), Datum/Beschriftung/Erinnerung änderbar; Schlüssel von aussen legt nur
--      admin an (Bereich ⇒ 42501); Schlüsselform wird geprüft;
--   04 Erinnerung in Tagen: 3 Tage ⇒ 72 Stunden, alte Stunden-Angabe gilt weiter, Tage gewinnen, 91 Tage/negativ ⇒ invalid_reminder;
--   05 Löschen: eigene ungenutzte Frist ja (Protokoll `deadline.delete`), Systemfrist ⇒ deadline_is_system, eigene Frist mit Verweis
--      (Speaker-Aufgabe) ⇒ deadline_in_use mit Zahl, fremder Bereich ⇒ 42501, unbekannt ⇒ deadline_not_found;
--   06 Übersicht: zeigt alle Fristen ohne Schlüsselspalte, can_edit je Rolle richtig, usage_count nur bei eigenen; production_team ohne
--      Übersichtsrecht? (Abschnitt deadlines = alle internen Rollen) sieht lesend, aber can_edit überall false;
--   07 Bestand unverändert: alle bisherigen Fristen custom = false.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_me uuid; v_uid uuid; v_email text; v_ed uuid; v_txt text; v_n integer; v_m integer; v_id uuid; v_id2 uuid; v_id3 uuid; v_sys uuid;
  v_key text; v_h integer; v_detail text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_me, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null limit 1;
  select id into v_ed from event where is_edition order by start_date desc limit 1;
  select id into v_sys from deadline where edition_id = v_ed and key = 'presentation_upload';

  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'admin', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  -- admin legt je Bereich eine eigene Frist an (Grundlage für die Rollen-Probe)
  v_id := upsert_deadline(jsonb_build_object('edition_id', v_ed, 'audience', 'speaker', 'due_at', '2027-04-01T10:00:00Z', 'label_de', 'ZZTEST Speaker-Frist', 'label_en', 'ZZTEST speaker deadline', 'reminder_days', 2));
  v_id2 := upsert_deadline(jsonb_build_object('edition_id', v_ed, 'audience', 'partner', 'due_at', '2027-04-02T10:00:00Z', 'label_de', 'ZZTEST Partner-Frist', 'label_en', 'ZZTEST partner deadline', 'reminder_days', 7));
  v_id3 := upsert_deadline(jsonb_build_object('edition_id', v_ed, 'audience', 'award', 'due_at', '2027-04-03T10:00:00Z', 'label_de', 'ZZTEST Award-Frist', 'label_en', 'ZZTEST award deadline'));

  -- 01 · Rollen-Probe
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'area_lead_partner', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  perform upsert_deadline(jsonb_build_object('edition_id', v_ed, 'key', (select key from deadline where id = v_id2), 'audience', 'partner', 'due_at', '2027-04-05T10:00:00Z', 'label_de', 'ZZTEST Partner-Frist neu'));
  v_txt := 'partner_aendert=' || (select label_de from deadline where id = v_id2);
  begin perform upsert_deadline(jsonb_build_object('edition_id', v_ed, 'key', (select key from deadline where id = v_id), 'audience', 'speaker', 'due_at', '2027-04-05T10:00:00Z')); v_txt := v_txt || ' speaker=ERLAUBT';
  exception when sqlstate '42501' then v_txt := v_txt || ' speaker=42501'; end;
  begin perform upsert_deadline(jsonb_build_object('edition_id', v_ed, 'audience', 'award', 'due_at', '2027-04-05T10:00:00Z', 'label_de', 'ZZTEST x', 'label_en', 'ZZTEST x')); v_txt := v_txt || ' award_neu=ERLAUBT';
  exception when sqlstate '42501' then v_txt := v_txt || ' award_neu=42501'; end;
  begin perform upsert_deadline(jsonb_build_object('edition_id', v_ed, 'audience', 'speaker', 'due_at', '2027-04-05T10:00:00Z', 'label_de', 'ZZTEST x', 'label_en', 'ZZTEST x')); v_txt := v_txt || ' speaker_neu=ERLAUBT';
  exception when sqlstate '42501' then v_txt := v_txt || ' speaker_neu=42501'; end;
  -- ein Partner-Lead darf eine Partner-Frist nicht in den Speaker-Bereich schieben
  begin perform upsert_deadline(jsonb_build_object('edition_id', v_ed, 'key', (select key from deadline where id = v_id2), 'audience', 'speaker', 'due_at', '2027-04-05T10:00:00Z')); v_txt := v_txt || ' verschieben=ERLAUBT';
  exception when sqlstate '42501' then v_txt := v_txt || ' verschieben=42501'; end;

  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'programme_team', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  perform upsert_deadline(jsonb_build_object('edition_id', v_ed, 'key', (select key from deadline where id = v_id), 'audience', 'speaker', 'due_at', '2027-04-06T10:00:00Z'));
  v_txt := v_txt || ' programm_speaker=' || to_char((select due_at from deadline where id = v_id), 'MM-DD');
  begin perform upsert_deadline(jsonb_build_object('edition_id', v_ed, 'key', (select key from deadline where id = v_id2), 'audience', 'partner', 'due_at', '2027-04-06T10:00:00Z')); v_txt := v_txt || ' programm_partner=ERLAUBT';
  exception when sqlstate '42501' then v_txt := v_txt || ' programm_partner=42501'; end;

  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'production_team', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  begin perform upsert_deadline(jsonb_build_object('edition_id', v_ed, 'key', (select key from deadline where id = v_id), 'audience', 'speaker', 'due_at', '2027-04-06T10:00:00Z')); v_txt := v_txt || ' production=ERLAUBT';
  exception when sqlstate '42501' then v_txt := v_txt || ' production=42501'; end;
  insert into t_res values ('01_rechte', v_txt
    || ' (erwartet partner_aendert=ZZTEST Partner-Frist neu speaker=42501 award_neu=42501 speaker_neu=42501 verschieben=42501 programm_speaker=04-06 programm_partner=42501 production=42501)');

  -- admin wieder
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'admin', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 02 · eigene Frist, Schlüssel erzeugt
  v_key := (select key from deadline where id = v_id);
  v_id := upsert_deadline(jsonb_build_object('edition_id', v_ed, 'audience', 'volunteer', 'due_at', '2027-05-01T10:00:00Z', 'label_de', 'ZZTEST Größe & Äpfel!', 'label_en', 'ZZTEST size'));
  v_id2 := upsert_deadline(jsonb_build_object('edition_id', v_ed, 'audience', 'volunteer', 'due_at', '2027-05-02T10:00:00Z', 'label_de', 'ZZTEST Größe & Äpfel!', 'label_en', 'ZZTEST size 2'));
  insert into t_res values ('02a_eigene_frist', 'schluessel1=' || (select key from deadline where id = v_id) || ' schluessel2=' || (select key from deadline where id = v_id2)
    || ' custom=' || (select custom::text from deadline where id = v_id) || ' erste_sichtbar_erzeugt=' || (v_key like 'custom_zztest%')::text
    || ' (erwartet custom_zztest_grosse_apfel und custom_zztest_grosse_apfel_2, custom=true)');
  v_txt := '';
  begin perform upsert_deadline(jsonb_build_object('edition_id', v_ed, 'audience', 'partner', 'due_at', '2027-05-01T10:00:00Z', 'label_en', 'x')); v_txt := 'A'; exception when sqlstate '22023' then v_txt := sqlerrm; end;
  begin perform upsert_deadline(jsonb_build_object('edition_id', v_ed, 'audience', 'partner', 'label_de', 'x', 'label_en', 'x')); v_txt := v_txt || ' / A'; exception when sqlstate '22023' then v_txt := v_txt || ' / ' || sqlerrm; end;
  begin perform upsert_deadline(jsonb_build_object('audience', 'partner', 'due_at', '2027-05-01T10:00:00Z', 'label_de', 'x', 'label_en', 'x')); v_txt := v_txt || ' / A'; exception when sqlstate '22023' then v_txt := v_txt || ' / ' || sqlerrm; end;
  begin perform upsert_deadline(jsonb_build_object('edition_id', gen_random_uuid(), 'audience', 'partner', 'due_at', '2027-05-01T10:00:00Z', 'label_de', 'x', 'label_en', 'x')); v_txt := v_txt || ' / A'; exception when sqlstate 'P0002' then v_txt := v_txt || ' / ' || sqlerrm; end;
  insert into t_res values ('02b_pflichtangaben', v_txt || ' (erwartet fields_required / fields_required / fields_required / edition_not_found)');

  -- 03 · Systemfrist
  begin perform upsert_deadline(jsonb_build_object('edition_id', v_ed, 'key', 'presentation_upload', 'audience', 'partner', 'due_at', '2027-04-14T10:00:00Z')); v_txt := 'A'; exception when sqlstate 'P0001' then v_txt := sqlerrm; end;
  perform upsert_deadline(jsonb_build_object('edition_id', v_ed, 'key', 'presentation_upload', 'audience', 'speaker', 'due_at', '2027-04-14T11:00:00Z', 'label_de', 'ZZTEST Präsentation'));
  v_txt := v_txt || ' datum=' || to_char((select due_at at time zone 'UTC' from deadline where id = v_sys), 'HH24') || ' label=' || (select label_de from deadline where id = v_sys)
        || ' custom=' || (select custom::text from deadline where id = v_sys);
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'area_lead_partner', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  begin perform upsert_deadline(jsonb_build_object('edition_id', v_ed, 'key', 'zztest_system_neu', 'audience', 'partner', 'due_at', '2027-04-14T10:00:00Z', 'label_de', 'x', 'label_en', 'x')); v_txt := v_txt || ' schluessel_bereich=ERLAUBT';
  exception when sqlstate '42501' then v_txt := v_txt || ' schluessel_bereich=42501'; end;
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'admin', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  begin perform upsert_deadline(jsonb_build_object('edition_id', v_ed, 'key', 'Falsch Geschrieben', 'audience', 'partner', 'due_at', '2027-04-14T10:00:00Z', 'label_de', 'x', 'label_en', 'x')); v_txt := v_txt || ' form=A'; exception when sqlstate '22023' then v_txt := v_txt || ' form=' || sqlerrm; end;
  perform upsert_deadline(jsonb_build_object('edition_id', v_ed, 'key', 'zztest_system_neu', 'audience', 'partner', 'due_at', '2027-04-14T10:00:00Z', 'label_de', 'ZZTEST System', 'label_en', 'ZZTEST system'));
  v_txt := v_txt || ' admin_system_neu_custom=' || (select custom::text from deadline where edition_id = v_ed and key = 'zztest_system_neu');
  insert into t_res values ('03_systemfrist', v_txt
    || ' (erwartet deadline_is_system datum=11 label=ZZTEST Präsentation custom=false schluessel_bereich=42501 form=fields_required admin_system_neu_custom=false)');

  -- 03b · Ändern über die Id (die Oberfläche kennt den Schlüssel nicht)
  perform upsert_deadline(jsonb_build_object('id', v_sys, 'audience', 'speaker', 'due_at', '2027-04-14T12:00:00Z', 'label_de', 'ZZTEST Präsentation 2'));
  begin perform upsert_deadline(jsonb_build_object('id', gen_random_uuid(), 'audience', 'speaker', 'due_at', '2027-04-14T12:00:00Z')); v_txt := 'A'; exception when sqlstate 'P0002' then v_txt := sqlerrm; end;
  insert into t_res values ('03b_aendern_ueber_id', 'label=' || (select label_de from deadline where id = v_sys) || ' stunde=' || to_char((select due_at at time zone 'UTC' from deadline where id = v_sys), 'HH24')
    || ' unbekannte_id=' || v_txt || ' (erwartet label=ZZTEST Präsentation 2 stunde=12 unbekannte_id=deadline_not_found)');

  -- 04 · Erinnerung in Tagen
  perform upsert_deadline(jsonb_build_object('edition_id', v_ed, 'key', (select key from deadline where id = v_id), 'audience', 'volunteer', 'due_at', '2027-05-01T10:00:00Z', 'reminder_days', 3));
  select reminder_lead_hours into v_h from deadline where id = v_id;
  v_txt := 'tage3=' || v_h;
  perform upsert_deadline(jsonb_build_object('edition_id', v_ed, 'key', (select key from deadline where id = v_id), 'audience', 'volunteer', 'due_at', '2027-05-01T10:00:00Z', 'reminder_lead_hours', 96));
  v_txt := v_txt || ' stunden96=' || (select reminder_lead_hours from deadline where id = v_id);
  perform upsert_deadline(jsonb_build_object('edition_id', v_ed, 'key', (select key from deadline where id = v_id), 'audience', 'volunteer', 'due_at', '2027-05-01T10:00:00Z', 'reminder_days', 1, 'reminder_lead_hours', 500));
  v_txt := v_txt || ' tage_gewinnen=' || (select reminder_lead_hours from deadline where id = v_id);
  perform upsert_deadline(jsonb_build_object('edition_id', v_ed, 'key', (select key from deadline where id = v_id), 'audience', 'volunteer', 'due_at', '2027-05-01T10:00:00Z'));
  v_txt := v_txt || ' ohne_angabe_bleibt=' || (select reminder_lead_hours from deadline where id = v_id);
  begin perform upsert_deadline(jsonb_build_object('edition_id', v_ed, 'key', (select key from deadline where id = v_id), 'audience', 'volunteer', 'due_at', '2027-05-01T10:00:00Z', 'reminder_days', 91)); v_txt := v_txt || ' 91=A'; exception when sqlstate '22023' then v_txt := v_txt || ' 91=' || sqlerrm; end;
  begin perform upsert_deadline(jsonb_build_object('edition_id', v_ed, 'key', (select key from deadline where id = v_id), 'audience', 'volunteer', 'due_at', '2027-05-01T10:00:00Z', 'reminder_days', -1)); v_txt := v_txt || ' minus1=A'; exception when sqlstate '22023' then v_txt := v_txt || ' minus1=' || sqlerrm; end;
  insert into t_res values ('04_erinnerung', v_txt || ' (erwartet tage3=72 stunden96=96 tage_gewinnen=24 ohne_angabe_bleibt=24 91=invalid_reminder minus1=invalid_reminder)');

  -- 05 · Löschen
  insert into speaker_task (edition_id, key, label_de, label_en, deadline_key) values (v_ed, 'zztest_aufgabe', 'ZZTEST Aufgabe', 'ZZTEST task', (select key from deadline where id = v_id2));
  v_txt := '';
  begin perform delete_deadline(v_id2); v_txt := 'A';
  exception when sqlstate 'P0001' then get stacked diagnostics v_detail = pg_exception_detail; v_txt := sqlerrm || '(' || v_detail || ')'; end;
  begin perform delete_deadline(v_sys); v_txt := v_txt || ' / A'; exception when sqlstate 'P0001' then v_txt := v_txt || ' / ' || sqlerrm; end;
  begin perform delete_deadline(gen_random_uuid()); v_txt := v_txt || ' / A'; exception when sqlstate 'P0002' then v_txt := v_txt || ' / ' || sqlerrm; end;
  perform delete_deadline(v_id);
  v_txt := v_txt || ' geloescht=' || (not exists (select 1 from deadline where id = v_id))::text;
  select count(*) into v_n from audit_log where action = 'deadline.delete' and object_id = v_id::text;
  v_txt := v_txt || ' protokoll=' || v_n;
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'area_lead_partner', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  begin perform delete_deadline(v_id2); v_txt := v_txt || ' fremder_bereich=A'; exception when sqlstate '42501' then v_txt := v_txt || ' fremder_bereich=42501'; end;
  insert into t_res values ('05_loeschen', v_txt
    || ' (erwartet deadline_in_use(1) / deadline_is_system / deadline_not_found geloescht=true protokoll=1 fremder_bereich=42501)');

  -- 06 · Übersicht
  select count(*), count(*) filter (where can_edit), count(*) filter (where custom) into v_n, v_m, v_h from deadlines_overview(v_ed);
  v_txt := 'partner_lead: zeilen>0=' || (v_n > 0)::text || ' aenderbar_nur_partner=' || (v_m = (select count(*) from deadline where edition_id = v_ed and audience = 'partner'))::text;
  select count(*) into v_n from deadlines_overview(v_ed) where can_edit and audience <> 'partner';
  v_txt := v_txt || ' fremde_aenderbar=' || v_n;
  select usage_count into v_h from deadlines_overview(v_ed) where id = v_id2;
  v_txt := v_txt || ' usage_der_genutzten=' || coalesce(v_h::text, '-');
  select reminder_days into v_h from deadlines_overview(v_ed) where id = v_sys;
  v_txt := v_txt || ' tage_presentation=' || v_h;
  v_txt := v_txt || ' spalten_ohne_key=' || (not exists (select 1 from pg_proc p, unnest(p.proargnames) a where p.proname = 'deadlines_overview' and a = 'key'))::text;
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'production_team', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  select count(*), count(*) filter (where can_edit) into v_n, v_m from deadlines_overview(v_ed);
  v_txt := v_txt || ' production: lesen=' || (v_n > 0)::text || ' aenderbar=' || v_m;
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'marketing_team', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  begin perform * from deadlines_overview(v_ed); v_txt := v_txt || ' marketing_team=liest'; exception when sqlstate '42501' then v_txt := v_txt || ' marketing_team=42501'; end;
  insert into t_res values ('06_uebersicht', v_txt
    || ' (erwartet zeilen>0=true aenderbar_nur_partner=true fremde_aenderbar=0 usage_der_genutzten=1 tage_presentation=2 spalten_ohne_key=true production: lesen=true aenderbar=0 marketing_team=liest)');

  -- 07 · Bestand
  select count(*) into v_n from deadline where custom and label_de not like 'ZZTEST%';
  insert into t_res values ('07_bestand', 'custom_im_bestand=' || v_n || ' (erwartet 0)');
end $$;
select * from t_res order by step;
rollback;

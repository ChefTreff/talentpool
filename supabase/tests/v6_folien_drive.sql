-- Test zu `v6_folien_drive` (SPK-023). Belegt:
--   01 eine angemeldete Sitzung bekommt die Kandidaten nicht — auch Admin nicht;
--   02 der Server bekommt die aktuelle Präsentation mit Slot, Bühne, Tag,
--      Namen und dem Zielordner der Edition (FLS27 ist gesetzt);
--   03 ältere Fassung und Foto stehen nicht in der Liste;
--   04 ohne Abschnitt `tech` kein Zielordner (42501);
--   05 mit Abschnitt `tech` (Admin) wird der Ordner gesetzt, mit Audit;
--   06 eine Adresse statt einer ID wird abgewiesen (22023 invalid_folder_id);
--   07 leer heisst: Einstellung entfernt;
--   08 eine Drive-Kopie ist nicht verwaist, solange die Präsentation aktuell
--      ist und die Session im Slot liegt (Vorbedingung) …
--   09 … und verwaist, sobald die Session aus dem Slot genommen ist …
--   10 … oder die Präsentation gelöscht ist (Zeile überlebt ohne Fremdschlüssel);
--   11 Tabellen: authenticated liest weder Ordner noch Spiegelstand;
--   12 Grants: Kandidaten und Waisen nur für den Server, Ordner setzen für authenticated.
--
-- Probelauf der Speaker-Session am 01.10.2026 gegen die Live-Datenbank
-- (`sh scripts/db.sh dry-run`, alles zurückgerollt): 13 von 13 Zeilen wie
-- erwartet. `db.sh fn-diff`: drei neue Funktionen, keine bestehende geändert.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_me uuid; v_uid uuid; v_email text; v_ed uuid; v_ev uuid; v_tz text; v_tag uuid; v_tag_datum date;
  v_bp uuid; v_profil uuid; v_stage uuid; v_slot uuid; v_se uuid; v_a1 uuid; v_a2 uuid; v_foto uuid;
  v_m uuid; v_start timestamptz; v_txt text; v_n integer; v_state text; v_ordner_vorher text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_me, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null limit 1;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select s.folder_id into v_ordner_vorher from slide_drive_setting s where s.edition_id = v_ed;
  select ev.id, ev.timezone into v_ev, v_tz from event ev
   where ev.edition_id = v_ed and not ev.is_edition order by (ev.slug = 'summit-27') desc, ev.start_date limit 1;
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;

  -- Wegwerf-Stammdaten: Tag, Bühne, Slot, Session, Speaker mit zwei Fassungen.
  select d.id, d.day_date into v_tag, v_tag_datum from event_day d where d.event_id = v_ev order by d.day_date limit 1;
  if v_tag is null then
    insert into event_day (event_id, day_date, label_de) values (v_ev, date '2027-04-16', 'Tag 1 · Freitag')
    returning id, day_date into v_tag, v_tag_datum;
  end if;
  v_start := (v_tag_datum + time '09:30') at time zone v_tz;
  insert into stage (event_id, name, slug) values (v_ev, 'ZZTEST Drive-Bühne', 'zztest-drive-' || substr(gen_random_uuid()::text, 1, 6))
  returning id into v_stage;
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type)
  values (v_stage, v_tag, v_start, v_start + interval '30 minutes', 'content') returning id into v_slot;
  insert into session (event_id, format, title_de, slot_id) values (v_ev, 'talk', 'ZZTEST Drive-Talk', v_slot)
  returning id into v_se;
  insert into person (first_name, last_name) values ('Anna', 'ZZTEST-Drive') returning id into v_bp;
  insert into speaker_profile (person_id, edition_id) values (v_bp, v_ed) returning id into v_profil;
  insert into session_speaker (session_id, person_id, role) values (v_se, v_bp, 'speaker');
  insert into speaker_asset (profile_id, session_id, kind, storage_path, filename, version, is_current, uploaded_by)
  values (v_profil, v_se, 'presentation', v_ed || '/' || v_profil || '/presentation/eins.pdf', 'eins.pdf', 1, false, v_me)
  returning id into v_a1;
  insert into speaker_asset (profile_id, session_id, kind, storage_path, filename, mime, version, is_current, uploaded_by)
  values (v_profil, v_se, 'presentation', v_ed || '/' || v_profil || '/presentation/zwei.pptx', 'Zwei.pptx',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation', 2, true, v_me)
  returning id into v_a2;
  insert into speaker_asset (profile_id, kind, storage_path, filename, version, is_current, uploaded_by)
  values (v_profil, 'photo', v_ed || '/' || v_profil || '/photo/ich.jpg', 'ich.jpg', 1, true, v_me)
  returning id into v_foto;

  -- 01 · Sitzung, sogar als Admin
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'admin', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  begin
    perform 1 from slide_mirror_candidates(v_ed, null);
    insert into t_res values ('01_sitzung_kandidaten', 'ERLAUBT (BUG)');
  exception when sqlstate '42501' then insert into t_res values ('01_sitzung_kandidaten', 'abgewiesen 42501');
  end;

  -- 02 · Server
  perform set_config('request.jwt.claims', '', true);
  select c.filename || ' v' || c.asset_version || ' · ' || c.stage_name || ' · ' || c.day_date || ' · '
         || to_char(c.slot_start at time zone c.timezone, 'HH24MI') || ' · ' || c.first_name || ' ' || c.last_name
         || ' · Ordner ' || coalesce(c.folder_id, 'null') || ' · Spiegel ' || coalesce(c.mirror_status, 'keiner')
    into v_txt
    from slide_mirror_candidates(v_ed, null) c where c.profile_id = v_profil;
  insert into t_res values ('02_server_kandidat', coalesce(v_txt, '(Zeile fehlt)')
    || ' (erwartet Zwei.pptx v2 · ZZTEST Drive-Bühne · <Tag> · 0930 · Anna ZZTEST-Drive · Ordner <FLS27> · Spiegel keiner)');

  -- 03 · nur die aktuelle Präsentation, kein Foto
  select count(*) into v_n from slide_mirror_candidates(null, null) c where c.profile_id = v_profil;
  select count(*) + v_n * 10 into v_n from slide_mirror_candidates(null, v_a1) c;
  insert into t_res values ('03_nur_aktuelle', case when v_n = 10 then 'ok (1 Zeile, alte Fassung leer)' else 'FEHLER ' || v_n end);

  -- 04 · ohne Abschnitt tech
  delete from role_assignment where person_id = v_me;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  begin
    perform set_edition_slides_folder(v_ed, 'ZZTESTordner0123456789');
    insert into t_res values ('04_ohne_tech', 'ERLAUBT (BUG)');
  exception when sqlstate '42501' then insert into t_res values ('04_ohne_tech', 'abgewiesen 42501');
  end;

  -- 05 · mit Abschnitt tech (Admin)
  perform set_config('request.jwt.claims', '', true);
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'admin', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  perform set_edition_slides_folder(v_ed, '  ZZTESTordner0123456789 ');
  perform set_config('request.jwt.claims', '', true);
  select s.folder_id || ', Audit ' || (select count(*) from audit_log l
           where l.action = 'edition.slides_folder' and l.object_id = v_ed::text and l.created_at >= now())
    into v_txt from slide_drive_setting s where s.edition_id = v_ed;
  insert into t_res values ('05_tech_setzt', coalesce(v_txt, '(keine Einstellung)') || ' (erwartet ZZTESTordner0123456789, Audit 1)');

  -- 06 · Adresse statt ID
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  begin
    perform set_edition_slides_folder(v_ed, 'https://drive.google.com/drive/folders/1S9d60I8FTA3mtPmYnN1t3Xys_2INQSuE');
    insert into t_res values ('06_adresse', 'ERLAUBT (BUG)');
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_txt = message_text;
    insert into t_res values ('06_adresse', v_state || ' ' || v_txt);
  end;

  -- 07 · leer entfernt
  perform set_edition_slides_folder(v_ed, '');
  perform set_config('request.jwt.claims', '', true);
  insert into t_res values ('07_leer_entfernt',
    case when not exists (select 1 from slide_drive_setting s where s.edition_id = v_ed) then 'ok, keine Einstellung'
         else 'FEHLER: Einstellung steht noch' end);

  -- 08 · Vorbedingung: Kopie mit aktueller Präsentation im Slot ist nicht verwaist
  insert into slide_drive_mirror (profile_id, session_id, asset_id, asset_version, drive_file_id, status, mirrored_at)
  values (v_profil, v_se, v_a2, 2, 'ZZTESTdatei0123456789', 'ok', now()) returning id into v_m;
  insert into t_res values ('08_nicht_verwaist',
    case when exists (select 1 from slide_mirror_orphans(500) o where o.mirror_id = v_m) then 'FEHLER: als verwaist gemeldet'
         else 'ok' end);

  -- 09 · Session aus dem Slot genommen
  update session set slot_id = null where id = v_se;
  select o.drive_file_id into v_txt from slide_mirror_orphans(500) o where o.mirror_id = v_m;
  insert into t_res values ('09_ohne_slot_verwaist', coalesce(v_txt, '(nicht gemeldet)') || ' (erwartet ZZTESTdatei0123456789)');
  update session set slot_id = v_slot where id = v_se;

  -- 10 · Präsentation gelöscht: die Zeile bleibt und ist verwaist
  delete from speaker_asset where id = v_a2;
  select o.drive_file_id into v_txt from slide_mirror_orphans(500) o where o.mirror_id = v_m;
  insert into t_res values ('10_geloescht_verwaist', coalesce(v_txt, '(nicht gemeldet)') || ' (erwartet ZZTESTdatei0123456789)');

  -- 11 · Tabellen für Sitzungen gesperrt
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  begin
    execute 'set local role authenticated';
    begin
      perform 1 from slide_drive_mirror limit 1;
      v_txt := 'Spiegel LESBAR (BUG)';
    exception when insufficient_privilege then v_txt := 'Spiegel gesperrt';
    end;
    begin
      perform 1 from slide_drive_setting limit 1;
      v_txt := v_txt || ', Ordner LESBAR (BUG)';
    exception when insufficient_privilege then v_txt := v_txt || ', Ordner gesperrt';
    end;
    execute 'reset role';
  end;
  perform set_config('request.jwt.claims', '', true);
  insert into t_res values ('11_tabellen', v_txt);

  -- 12 · Grants
  insert into t_res values ('12_grants',
    'anon Kandidaten ' || has_function_privilege('anon', 'slide_mirror_candidates(uuid,uuid)', 'execute')
    || ', authenticated Kandidaten ' || has_function_privilege('authenticated', 'slide_mirror_candidates(uuid,uuid)', 'execute')
    || ', authenticated Waisen ' || has_function_privilege('authenticated', 'slide_mirror_orphans(integer)', 'execute')
    || ', authenticated Ordner ' || has_function_privilege('authenticated', 'set_edition_slides_folder(uuid,text)', 'execute')
    || ', anon Ordner ' || has_function_privilege('anon', 'set_edition_slides_folder(uuid,text)', 'execute')
    || ' (erwartet false, false, false, true, false)');

  insert into t_res values ('00_ordner_vor_dem_test', coalesce(v_ordner_vorher, 'null') || ' (erwartet 1S9d60I8FTA3mtPmYnN1t3Xys_2INQSuE)');
end $$;
select * from t_res order by step;
rollback;

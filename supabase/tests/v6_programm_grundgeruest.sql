-- Smoke-Test 0110 (Programm-Grundgerüst pflegbar). Belegt:
--   01 ohne Programm-Recht ist jeder Schreibweg zu ⇒ 42501;
--   02 Tag anlegen; derselbe Tag ein zweites Mal **ändert** ihn, statt an der
--      Eindeutigkeit zu scheitern — sonst hätte man einen Fehler statt einer
--      Korrektur;
--   03 unbekannter Bühnentyp ⇒ 22023 `invalid_stage_type`;
--   04 Öffnungszeiten setzen; schliesst die Bühne vor dem Öffnen ⇒ 22023
--      `invalid_times` (das Board würde sonst jeden Slot ablehnen, ohne Grund);
--   05 `upsert_stage_day` legt die fehlende Zeile an und ändert die bestehende;
--   06 Track anlegen und wieder löschen;
--   07 Bühne mit Slot ⇒ P0001 `in_use`, Detail `slots:1`;
--   08 Bühne mit Rollenzuweisung ⇒ P0001 `in_use`, Detail `roles:1` — die
--      Zuweisung hat keinen Fremdschlüssel und zeigte sonst stumm ins Leere;
--   09 Track mit Session ⇒ P0001 `in_use`, Detail `sessions:1`;
--   10 `programme_skeleton` liefert Tage, Bühnen, Bühnen-Tage und Tracks mit
--      den Zahlen, die am Löschen hängen;
--   11 `programme_skeleton` ohne Recht ⇒ 42501;
--   12 das Protokoll trägt den **Vorherzustand**, nicht nur die Eingabe.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ev uuid;
  v_day uuid; v_day2 uuid; v_stage uuid; v_sd uuid; v_track uuid; v_slot uuid; v_session uuid;
  v_n integer; v_txt text; v_json jsonb;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  delete from staff_user where auth_user_id = v_uid;
  select e.id into v_ev from event e where e.is_edition and e.slug = 'fls27';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 01 · Ohne Recht.
  begin
    perform upsert_event_day(jsonb_build_object('event_id', v_ev, 'day_date', '2027-04-15'));
    insert into t_res values ('01_ohne_recht', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('01_ohne_recht', 'abgewiesen ' || sqlstate); end;

  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'programme_team', 'global');

  -- 02 · Tag anlegen und derselbe Tag noch einmal.
  v_day := upsert_event_day(jsonb_build_object('event_id', v_ev, 'day_date', '2027-04-15',
                                               'label_de', 'Vorabend', 'doors_open', '17:00'));
  v_day2 := upsert_event_day(jsonb_build_object('event_id', v_ev, 'day_date', '2027-04-15',
                                                'label_de', 'Warm-up'));
  select label_de into v_txt from event_day where id = v_day;
  insert into t_res values ('02_tag',
    case when v_day2 = v_day and v_txt = 'Warm-up' then 'zweimal derselbe Tag aendert ihn (richtig)'
         else 'unerwartet ' || coalesce(v_txt, 'null') end);

  -- 03 · Unbekannter Bühnentyp.
  begin
    perform upsert_stage(jsonb_build_object('event_id', v_ev, 'name', 'Testbuehne', 'type', 'zirkuszelt'));
    insert into t_res values ('03_buehnentyp', 'ANGENOMMEN (BUG)');
  exception when others then
    insert into t_res values ('03_buehnentyp', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  v_stage := upsert_stage(jsonb_build_object('event_id', v_ev, 'name', 'Testbuehne', 'type', 'side',
                                             'slug', 'testbuehne', 'changeover_min', 10));

  -- 04 · Öffnungszeiten.
  begin
    perform upsert_stage_day(jsonb_build_object('stage_id', v_stage, 'event_day_id', v_day,
                                                'open_from', '18:00', 'open_to', '09:00'));
    insert into t_res values ('04_zeiten_verdreht', 'ANGENOMMEN (BUG)');
  exception when others then
    insert into t_res values ('04_zeiten_verdreht', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  -- 05 · Anlegen, dann ändern.
  v_sd := upsert_stage_day(jsonb_build_object('stage_id', v_stage, 'event_day_id', v_day,
                                              'open_from', '09:00', 'open_to', '18:00', 'slot_quota', 12));
  perform upsert_stage_day(jsonb_build_object('stage_id', v_stage, 'event_day_id', v_day, 'open_to', '20:00'));
  select open_from::text || '-' || open_to::text || '/' || slot_quota into v_txt from stage_day where id = v_sd;
  insert into t_res values ('05_buehnentag',
    case when v_txt = '09:00:00-20:00:00/12' then 'angelegt und geaendert, Rest bleibt (richtig)'
         else 'unerwartet ' || coalesce(v_txt, 'null') end);

  -- 06 · Track.
  v_track := upsert_track(jsonb_build_object('event_id', v_ev, 'name_de', 'Testtrack', 'slug', 'testtrack'));
  perform delete_track(v_track);
  select count(*)::integer into v_n from track where id = v_track;
  insert into t_res values ('06_track',
    case when v_n = 0 then 'angelegt und geloescht (richtig)' else 'noch da (BUG)' end);
  v_track := upsert_track(jsonb_build_object('event_id', v_ev, 'name_de', 'Testtrack', 'slug', 'testtrack2'));

  -- 07 · Bühne mit Slot.
  insert into slot (stage_id, event_day_id, start_at, end_at)
  values (v_stage, v_day, '2027-04-15 10:00+02', '2027-04-15 10:30+02') returning id into v_slot;
  begin
    perform delete_stage(v_stage);
    insert into t_res values ('07_buehne_mit_slot', 'GELOESCHT (BUG)');
  exception when others then
    insert into t_res values ('07_buehne_mit_slot', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;
  delete from slot where id = v_slot;

  -- 08 · Bühne mit Rollenzuweisung.
  insert into role_assignment (person_id, role, scope_type, scope_id)
  values (v_pid, 'standbuehne_editor', 'stage', v_stage);
  begin
    perform delete_stage(v_stage);
    insert into t_res values ('08_buehne_mit_rolle', 'GELOESCHT (BUG)');
  exception when others then
    insert into t_res values ('08_buehne_mit_rolle', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;
  delete from role_assignment where scope_type = 'stage' and scope_id = v_stage;

  -- 09 · Track mit Session.
  insert into session (event_id, title_de, track_id) values (v_ev, 'Testsession', v_track)
  returning id into v_session;
  begin
    perform delete_track(v_track);
    insert into t_res values ('09_track_mit_session', 'GELOESCHT (BUG)');
  exception when others then
    insert into t_res values ('09_track_mit_session', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  -- 10 · Das Gerüst mit den Zahlen.
  v_json := programme_skeleton(v_ev);
  insert into t_res values ('10_geruest',
    case when jsonb_array_length(v_json->'days') > 0
          and jsonb_array_length(v_json->'stages') > 0
          and jsonb_array_length(v_json->'stage_days') > 0
          and (select count(*) from jsonb_array_elements(v_json->'tracks') t
                where t->>'id' = v_track::text and (t->>'sessions')::integer = 1) = 1
         then 'Tage, Buehnen, Buehnen-Tage und Tracks mit Zahlen (richtig)'
         else 'unerwartet' end);

  -- 12 · Protokoll mit Vorherzustand.
  perform upsert_stage(jsonb_build_object('id', v_stage, 'name', 'Testbuehne neu'));
  -- Nicht „die neueste Zeile": in **einer** Transaktion tragen alle Zeilen
  -- denselben `now()`-Zeitstempel, die Reihenfolge wäre Zufall. Gefragt ist,
  -- **ob** eine Zeile mit dem Vorherzustand existiert.
  select count(*)::integer into v_n from audit_log a
   where a.action = 'programme.stage_upsert' and a.object_id = v_stage::text
     and a.before->>'name' = 'Testbuehne' and a.after->>'name' = 'Testbuehne neu';
  insert into t_res values ('12_protokoll',
    case when v_n = 1 then 'Vorher und Nachher im Protokoll (richtig)'
         else 'unerwartet ' || v_n end);

  -- 11 · Lesen ohne Recht.
  delete from role_assignment where person_id = v_pid;
  begin
    perform programme_skeleton(v_ev);
    insert into t_res values ('11_geruest_ohne_recht', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('11_geruest_ohne_recht', 'abgewiesen ' || sqlstate); end;
end $$;
select * from t_res order by step;
rollback;

-- Smoke-Test 0065/0066: Volunteer-Bewerbung, Zuteilung, Warteliste. Belegt: Bewerbung ohne Einwilligung ⇒ P0001 consent_required;
-- unter 18 am ersten Eventtag ⇒ P0001 too_young mit Datum; unbekannte Shirt-Größe/Bereich ⇒ 22023; zweite Bewerbung ⇒ 23505 already_applied;
-- Zuteilung nur für angenommene Volunteers (P0001 not_accepted); Kapazität+Überbuchung voll ⇒ Warteliste, ausdrückliches `assigned` ⇒ P0001 shift_full;
-- 0066: leere Einträge in day_prefs fallen weg, unbekannte und unförmige Ids ⇒ P0002 day_not_found (kein 22004/22P02);
-- Überschneidung ⇒ P0001 shift_overlap; Absage zieht die Warteliste nach; Team-RPCs für Fremde 42501; Tabellen ohne Grants.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_start date; v_day uuid;
        v_p2 uuid; v_p3 uuid; v_prof uuid; v_s1 uuid; v_s2 uuid; v_a uuid; v_detail text; v_n integer;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid; delete from staff_user where auth_user_id = v_uid;
  select e.id, e.start_date into v_ed, v_start from event e where e.is_edition and e.slug = 'fls27';
  select d.id into v_day from event_day d where d.event_id = v_ed order by d.sort_order limit 1;
  if v_day is null then
    -- FLS27 hat noch keine Tage; der Rollback räumt den Wegwerf-Tag wieder weg.
    insert into event_day (event_id, day_date, label_de, label_en, sort_order)
    values (v_ed, coalesce((select e.start_date from event e where e.id = v_ed), current_date), 'Testtag', 'Test day', 99)
    returning id into v_day;
  end if;

  -- Zwei weitere Wegwerf-Personen für Kapazität und Warteliste
  insert into person (first_name, last_name, birthdate) values ('Vera', 'Volunteer', '1995-01-01') returning id into v_p2;
  insert into person (first_name, last_name, birthdate) values ('Wanda', 'Warteliste', '1995-01-01') returning id into v_p3;

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 01 Bewerbung ohne Einwilligung
  delete from consent_record where person_id = v_pid;
  begin
    perform apply_volunteer(jsonb_build_object('edition_id', v_ed, 'birthdate', '1995-01-01'));
    insert into t_res values ('01_ohne_consent', 'ALLOWED (BUG)');
  exception when others then
    insert into t_res values ('01_ohne_consent', 'rejected ' || sqlstate || ' ' || sqlerrm);
  end;

  insert into consent_record (person_id, consent_type, version, granted, source)
  values (v_pid, 'terms', 'test', true, 'test'), (v_pid, 'privacy', 'test', true, 'test');

  -- 02 zu jung am ersten Eventtag
  begin
    perform apply_volunteer(jsonb_build_object('edition_id', v_ed, 'birthdate', (v_start - interval '17 years')::date));
    insert into t_res values ('02_zu_jung', 'ALLOWED (BUG)');
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    insert into t_res values ('02_zu_jung', 'rejected ' || sqlerrm || ' erster Tag=' || coalesce(v_detail, ''));
  end;

  -- 03 unbekannte Shirt-Größe und unbekannter Bereich
  begin
    perform apply_volunteer(jsonb_build_object('edition_id', v_ed, 'birthdate', '1995-01-01', 'shirt_size', 'XXXL'));
    insert into t_res values ('03_shirt', 'ALLOWED (BUG)');
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    insert into t_res values ('03_shirt', 'rejected ' || sqlerrm || ' ' || coalesce(v_detail, ''));
  end;
  begin
    perform apply_volunteer(jsonb_build_object('edition_id', v_ed, 'birthdate', '1995-01-01',
                                               'areas', jsonb_build_array('gibtsnicht')));
    insert into t_res values ('04_bereich', 'ALLOWED (BUG)');
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    insert into t_res values ('04_bereich', 'rejected ' || sqlerrm || ' ' || coalesce(v_detail, ''));
  end;

  -- 04b unbekannter und unförmiger Tag (0066: sauberer Schlüssel statt 22004/22P02)
  begin
    perform apply_volunteer(jsonb_build_object('edition_id', v_ed, 'birthdate', '1995-01-01',
                                               'day_prefs', jsonb_build_array('00000000-0000-0000-0000-000000000000')));
    insert into t_res values ('04b_tag_unbekannt', 'ALLOWED (BUG)');
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    insert into t_res values ('04b_tag_unbekannt', 'rejected ' || sqlstate || ' ' || sqlerrm || ' ' || coalesce(v_detail, ''));
  end;
  begin
    perform apply_volunteer(jsonb_build_object('edition_id', v_ed, 'birthdate', '1995-01-01',
                                               'day_prefs', jsonb_build_array('kein-uuid')));
    insert into t_res values ('04c_tag_unfoermig', 'ALLOWED (BUG)');
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    insert into t_res values ('04c_tag_unfoermig', 'rejected ' || sqlstate || ' ' || sqlerrm || ' ' || coalesce(v_detail, ''));
  end;

  -- 05 gültige Bewerbung (ohne Bereiche — das Vokabular ist noch leer)
  -- Leerer Eintrag und JSON-null fallen weg (0066), der echte Tag bleibt stehen.
  v_prof := apply_volunteer(jsonb_build_object('edition_id', v_ed, 'birthdate', '1995-01-01', 'shirt_size', 'L',
                                               'day_prefs', jsonb_build_array(v_day::text, '', null),
                                               'availability', jsonb_build_object('fr', 'ab 12')));
  insert into t_res values ('05_beworben', (select status from volunteer_profile where id = v_prof)
                                           || ' tage=' || (select cardinality(day_prefs)::text from volunteer_profile where id = v_prof)
                                           || ' mail=' || (select count(*)::text from mail_log where person_id = v_pid and template_key = 'volunteer_applied'));

  -- 05b eigene Wünsche ändern: Tage werden jetzt genauso geprüft (0066)
  perform update_my_volunteer_profile(jsonb_build_object('day_prefs', jsonb_build_array(v_day::text, '')));
  insert into t_res values ('05b_wuensche_geaendert',
    'tage=' || (select cardinality(day_prefs)::text from volunteer_profile where id = v_prof));
  begin
    perform update_my_volunteer_profile(jsonb_build_object('day_prefs', jsonb_build_array('kein-uuid')));
    insert into t_res values ('05c_wuensche_unfoermig', 'ALLOWED (BUG)');
  exception when others then
    insert into t_res values ('05c_wuensche_unfoermig', 'rejected ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 06 zweite Bewerbung
  begin
    perform apply_volunteer(jsonb_build_object('edition_id', v_ed));
    insert into t_res values ('06_zweimal', 'ALLOWED (BUG)');
  exception when others then
    insert into t_res values ('06_zweimal', 'rejected ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 07 Team-RPCs ohne Rolle
  begin
    perform volunteer_admin_overview(v_ed);
    insert into t_res values ('07_admin_ohne_rolle', 'ALLOWED (BUG)');
  exception when others then
    insert into t_res values ('07_admin_ohne_rolle', 'rejected ' || sqlstate);
  end;

  -- ab hier als Volunteer-Leitung
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'volunteer_lead', 'global');

  -- 08 Schicht anlegen: Kapazität 1, Überbuchung 1
  v_s1 := upsert_shift(jsonb_build_object('edition_id', v_ed, 'event_day_id', v_day::text, 'area', 'testbereich',
                                          'position', 'Einlass', 'start_at', (now() + interval '10 days')::text,
                                          'end_at', (now() + interval '10 days 4 hours')::text,
                                          'capacity', 1, 'overbook', 1, 'location', 'Halle A'));
  v_s2 := upsert_shift(jsonb_build_object('edition_id', v_ed, 'area', 'testbereich', 'position', 'Garderobe',
                                          'start_at', (now() + interval '10 days 2 hours')::text,
                                          'end_at', (now() + interval '10 days 6 hours')::text, 'capacity', 5));
  insert into t_res values ('08_schichten', 'angelegt kapazitaet=' || (select (capacity + overbook)::text from shift where id = v_s1));

  -- 09 Zuteilung nur für angenommene Bewerbungen
  begin
    perform assign_shift(v_s1, v_pid);
    insert into t_res values ('09_nicht_angenommen', 'ALLOWED (BUG)');
  exception when others then
    insert into t_res values ('09_nicht_angenommen', 'rejected ' || sqlerrm);
  end;

  -- 10 annehmen ⇒ Rolle volunteer für die Edition
  perform set_volunteer_status(v_prof, 'accepted', 'willkommen');
  insert into t_res values ('10_angenommen',
    (select status from volunteer_profile where id = v_prof)
    || ' rolle=' || (select count(*)::text from role_assignment r where r.person_id = v_pid and r.role = 'volunteer'
                       and r.edition_id = v_ed and (r.valid_to is null or r.valid_to > now()))
    || ' mail=' || (select count(*)::text from mail_log where person_id = v_pid and template_key = 'volunteer_accepted'));

  -- Die beiden anderen ebenfalls annehmen
  insert into volunteer_profile (person_id, edition_id, status) values (v_p2, v_ed, 'accepted'), (v_p3, v_ed, 'accepted');

  -- 11 zuteilen bis die Schicht voll ist (1 + 1 Überbuchung)
  v_a := assign_shift(v_s1, v_pid);
  perform assign_shift(v_s1, v_p2);
  insert into t_res values ('11_voll', 'belegt=' || shift_taken(v_s1)::text
    || ' mail=' || (select count(*)::text from mail_log where person_id = v_pid and template_key = 'shift_assigned'));

  -- 12 dritte Person landet auf der Warteliste statt an einem Fehler
  perform assign_shift(v_s1, v_p3);
  insert into t_res values ('12_warteliste', (select status from shift_assignment where shift_id = v_s1 and person_id = v_p3));

  -- 13 ausdrückliches `assigned` bei voller Schicht
  begin
    perform assign_shift(v_s1, v_p3, 'assigned');
    insert into t_res values ('13_shift_full', 'ALLOWED (BUG)');
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    insert into t_res values ('13_shift_full', 'rejected ' || sqlerrm || ' ' || coalesce(v_detail, ''));
  end;

  -- 14 Überschneidung mit der zweiten Schicht
  begin
    perform assign_shift(v_s2, v_pid);
    insert into t_res values ('14_overlap', 'ALLOWED (BUG)');
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    insert into t_res values ('14_overlap', 'rejected ' || sqlerrm || ' ' || coalesce(v_detail, ''));
  end;

  -- 15 bestätigen, dann absagen ⇒ Warteliste rückt nach
  perform confirm_shift(v_a);
  insert into t_res values ('15_bestaetigt', (select status from shift_assignment where id = v_a));
  perform decline_shift(v_a, 'krank');
  insert into t_res values ('16_nachgerueckt',
    'abgesagt=' || (select status from shift_assignment where id = v_a)
    || ' warteliste=' || (select status from shift_assignment where shift_id = v_s1 and person_id = v_p3)
    || ' belegt=' || shift_taken(v_s1)::text);

  -- 17 Erinnerung: Schicht in 24 Stunden, genau einmal
  update shift set start_at = now() + interval '24 hours', end_at = now() + interval '28 hours' where id = v_s1;
  v_n := send_shift_reminders();
  insert into t_res values ('17_erinnerung', 'erste=' || v_n::text || ' zweite=' || send_shift_reminders()::text);

  -- 18 eigene Sicht
  insert into t_res values ('18_my_shifts', (select count(*)::text from my_shifts(v_ed)));

  -- 19 Absage des Teams beendet die Rolle
  perform set_volunteer_status(v_prof, 'declined', 'doch nicht');
  insert into t_res values ('19_abgesagt',
    'rolle_aktiv=' || (select count(*)::text from role_assignment r where r.person_id = v_pid and r.role = 'volunteer'
                         and r.edition_id = v_ed and (r.valid_to is null or r.valid_to > now())));

  -- 20 Grants: die Tabellen sind für Angemeldete dicht
  insert into t_res values ('20_grants',
    'profile=' || has_table_privilege('authenticated', 'volunteer_profile', 'select')::text ||
    ' shift=' || has_table_privilege('authenticated', 'shift', 'select')::text ||
    ' assignment=' || has_table_privilege('authenticated', 'shift_assignment', 'insert')::text ||
    ' promote=' || has_function_privilege('authenticated', 'promote_shift_waitlist(uuid)', 'execute')::text ||
    ' day_prefs=' || has_function_privilege('authenticated', 'volunteer_day_prefs(jsonb,uuid)', 'execute')::text);
end $$;
select * from t_res order by step;
rollback;

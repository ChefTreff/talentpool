-- Smoke-Test 0070: Volunteer-Leads sehen keine Bewerbungen. Belegt: `is_volunteer_team()` ist für einen reinen
-- `volunteer_lead` falsch, `volunteer_admin_overview`, `shift_plan` und `assign_shift` antworten 42501;
-- `my_lead_shifts()` gibt genau die eigenen Schichten mit Namen und Stand — ohne Mailadressen, ohne Warteliste,
-- und nichts von fremden Schichten.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_day uuid; v_p2 uuid; v_s uuid; v_a uuid;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid; delete from staff_user where auth_user_id = v_uid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select d.id into v_day from event_day d join event e on e.id = d.event_id
   where e.id = v_ed or e.edition_id = v_ed order by d.day_date limit 1;
  insert into vocab_term (vocabulary, key, label_de, label_en, sort_order)
  values ('volunteer_area', 'testbereich', 'Testbereich', 'Test area', 99) on conflict (vocabulary, key) do nothing;
  insert into person (first_name, last_name, birthdate) values ('Vera', 'Volunteer', '1995-01-01') returning id into v_p2;
  insert into volunteer_profile (person_id, edition_id, status) values (v_p2, v_ed, 'accepted');

  -- Aufbau als Admin: Schicht mit der Testperson als Leitung, jemand zugeteilt
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  v_s := upsert_shift(jsonb_build_object('edition_id', v_ed, 'event_day_id', v_day::text, 'area', 'testbereich',
                                         'position', 'Einlass', 'start_at', (now() + interval '5 days')::text,
                                         'end_at', (now() + interval '5 days 4 hours')::text, 'capacity', 3,
                                         'lead_person_id', v_pid::text, 'briefing_md', 'Weste am Infostand.'));
  v_a := assign_shift(v_s, v_p2);
  insert into t_res values ('01_aufbau', 'schicht und zuteilung angelegt');

  -- Ab hier: reiner volunteer_lead, kein Team
  delete from role_assignment where person_id = v_pid;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'volunteer_lead', 'global');
  insert into t_res values ('02_is_volunteer_team', is_volunteer_team()::text);
  begin
    perform volunteer_admin_overview(v_ed);
    insert into t_res values ('03_bewerbungen', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('03_bewerbungen', 'rejected ' || sqlstate); end;
  begin
    perform shift_plan(v_ed);
    insert into t_res values ('04_schichtplan', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('04_schichtplan', 'rejected ' || sqlstate); end;
  begin
    perform assign_shift(v_s, v_p2);
    insert into t_res values ('05_zuteilen', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('05_zuteilen', 'rejected ' || sqlstate); end;

  insert into t_res values ('06_eigene_schichten', (select count(*)::text from my_lead_shifts(v_ed)));
  insert into t_res values ('07_leute_darauf', (select jsonb_array_length(people)::text from my_lead_shifts(v_ed) limit 1));
  -- Die Nutzlast darf keine Mailadresse enthalten; ein @ wäre schon zu viel.
  insert into t_res values ('08_keine_mailadressen',
    (select (people::text not like '%@%')::text from my_lead_shifts(v_ed) limit 1));

  -- Warteliste bleibt unsichtbar (Admin setzt sie, Lead sieht sie nicht)
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  update shift_assignment set status = 'waitlisted' where id = v_a;
  insert into t_res values ('09_warteliste_unsichtbar', (select jsonb_array_length(people)::text from my_lead_shifts(v_ed) limit 1));

  -- Schicht unter fremder Leitung taucht nicht auf
  update shift set lead_person_id = v_p2 where id = v_s;
  insert into t_res values ('10_fremde_schicht', (select count(*)::text from my_lead_shifts(v_ed)));

  insert into t_res values ('11_grants',
    'my_lead_shifts=' || has_function_privilege('authenticated', 'my_lead_shifts(uuid)', 'execute')::text);
end $$;
select * from t_res order by step;
rollback;

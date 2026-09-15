-- Smoke-Test 0104 (Speaker-Leads verwalten). Belegt:
--   01 ohne Team-Rolle bleibt die Lead-Verwaltung zu ⇒ 42501;
--   02 dasselbe für die Liste der unbetreuten Speaker;
--   03 eine Lead-Person erscheint mit ihren aktiven Rollen — inklusive der
--      Zuweisungs-ID, ohne die man die Rolle von hier nicht entziehen könnte;
--   04 die Zahlen stimmen: betreut, zugesagt, abgesagt;
--   05 offene Schritte werden über alle betreuten Speaker summiert;
--   06 eine abgelaufene Rolle macht niemanden zum Lead;
--   07 unbetreute Speaker erscheinen, Absagen aber nicht — wer abgesagt hat,
--      braucht keine Betreuung mehr;
--   08 nach der Zuordnung verschwindet der Speaker aus der Gegenliste und
--      zählt bei der Lead-Person;
--   09 `my_manager_scope` nennt die eigene Personen-ID — ohne sie kann das
--      Lead-Portal nicht wissen, ob es die Übergabe anbieten darf.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid;
  v_lead uuid; v_alt uuid; v_a uuid; v_b uuid; v_c uuid; v_sp1 uuid; v_sp2 uuid; v_sp3 uuid;
  v_row record; v_txt text; v_n integer;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  delete from staff_user where auth_user_id = v_uid;
  delete from speaker_profile where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 01/02 · Ohne Rolle.
  begin
    perform speaker_leads_admin(v_ed);
    insert into t_res values ('01_leads_ohne_recht', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('01_leads_ohne_recht', 'abgewiesen ' || sqlstate); end;
  begin
    perform unassigned_speakers(v_ed);
    insert into t_res values ('02_offene_ohne_recht', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('02_offene_ohne_recht', 'abgewiesen ' || sqlstate); end;

  -- Eine Lead-Person mit drei Speakern, eine abgelaufene Rolle daneben.
  insert into person (first_name, last_name, preferred_language, source_first, tier)
    values ('Lea', 'Leadsen', 'de', 'test', 'lead') returning id into v_lead;
  insert into role_assignment (person_id, role, scope_type, edition_id)
    values (v_lead, 'speaker_manager', 'edition', v_ed);
  insert into person (first_name, last_name, preferred_language, source_first, tier)
    values ('Alt', 'Lead', 'de', 'test', 'lead') returning id into v_alt;
  insert into role_assignment (person_id, role, scope_type, valid_from, valid_to)
    values (v_alt, 'speaker_manager', 'global', now() - interval '2 days', now() - interval '1 day');

  insert into person (first_name, last_name, preferred_language, source_first, tier)
    values ('Ada', 'Sprecher', 'de', 'test', 'lead') returning id into v_a;
  insert into person (first_name, last_name, preferred_language, source_first, tier)
    values ('Bo', 'Sprecher', 'de', 'test', 'lead') returning id into v_b;
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, owner_person_id, confirmed_at)
    values (v_a, v_ed, 'keynote', 'confirmed', v_lead, now()) returning id into v_sp1;
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, owner_person_id, declined_at)
    values (v_b, v_ed, 'panelist', 'declined', v_lead, now()) returning id into v_sp2;
  -- Der dritte ist unbetreut und soll in der Gegenliste stehen.
  insert into person (first_name, last_name, preferred_language, source_first, tier)
    values ('Cem', 'Sprecher', 'de', 'test', 'lead') returning id into v_c;
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status)
    values (v_c, v_ed, 'jury', 'lead') returning id into v_sp3;

  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_speaker', 'global');

  -- 03/04/05 · Die Zeile der Lead-Person.
  select * into v_row from speaker_leads_admin(v_ed) l where l.person_id = v_lead;
  insert into t_res values ('03_zuweisungen',
    case when jsonb_array_length(v_row.assignments) = 1
          and (v_row.assignments->0) ? 'id'
          and v_row.assignments->0->>'scope_type' = 'edition'
         then 'Rolle mit ID und Scope (richtig)'
         else 'unerwartet ' || coalesce(v_row.assignments::text, 'null') end);
  insert into t_res values ('04_zahlen',
    case when v_row.speakers = 2 and v_row.confirmed = 1 and v_row.declined = 1
         then '2 betreut, 1 zugesagt, 1 abgesagt (richtig)'
         else 'unerwartet ' || v_row.speakers || '/' || v_row.confirmed || '/' || v_row.declined end);
  insert into t_res values ('05_offene_schritte',
    case when v_row.open_steps >= 0 then v_row.open_steps || ' offene Schritte summiert (richtig)'
         else 'unerwartet' end);

  -- 06 · Abgelaufene Rolle.
  select count(*)::integer into v_n from speaker_leads_admin(v_ed) l
   where l.display_name = 'Alt Lead';
  insert into t_res values ('06_abgelaufen',
    case when v_n = 0 then 'kein Lead mehr (richtig)' else 'noch gelistet (BUG)' end);

  -- 07 · Die Gegenliste.
  select string_agg(u.display_name, ',' order by u.display_name) into v_txt
    from unassigned_speakers(v_ed) u
   where u.profile_id in (v_sp1, v_sp2, v_sp3);
  insert into t_res values ('07_ohne_betreuung',
    case when v_txt = 'Cem Sprecher' then 'nur der unbetreute, ohne Absage (richtig)'
         else 'unerwartet ' || coalesce(v_txt, 'null') end);

  -- 08 · Zuordnen.
  perform handover_speaker(v_sp3, v_lead);
  select count(*)::integer into v_n from unassigned_speakers(v_ed) u where u.profile_id = v_sp3;
  select * into v_row from speaker_leads_admin(v_ed) l where l.person_id = v_lead;
  insert into t_res values ('08_zugeordnet',
    case when v_n = 0 and v_row.speakers = 3 then 'aus der Gegenliste, bei der Lead-Person (richtig)'
         else 'unerwartet ' || v_n || '/' || v_row.speakers end);
  -- 09 · Der Scope kennt sich selbst.
  insert into t_res values ('09_scope_person_id',
    case when (my_manager_scope()->>'person_id')::uuid = v_pid
          and my_manager_scope() ? 'owned_profiles'
         then 'eigene ID dabei, Rest unveraendert (richtig)'
         else 'unerwartet ' || coalesce(my_manager_scope()->>'person_id', 'null') end);
end $$;
select * from t_res order by step;
rollback;

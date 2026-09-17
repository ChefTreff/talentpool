-- Smoke-Test 0085 (Hackathon). Belegt:
--   01 ohne Anmeldung 28000, Team-RPCs für Fremde 42501;
--   02 Bewerbung mit unbekanntem Skill ⇒ 22023;
--   03 Team anlegen macht den Gründer zum Kapitän; zweites Team ⇒ P0001 already_in_team;
--   04 Maximum 8 greift auf **jedem** Weg, nicht nur über den Beitrittscode ⇒ P0001 team_full;
--   05 Einreichung unter drei Personen ⇒ P0001 team_too_small;
--   06 `assign_challenges` verteilt gleichmässig und fasst gesetzte Zuordnungen nicht an;
--   07 Verlassen: letztes Mitglied zieht das Team zurück, sonst rückt ein Kapitän nach;
--   08 Judging rechnet die Gewichte, Punkte über 10 ⇒ 22023;
--   09 Tabellen ohne Grants für authenticated;
--   10 (Review 14.09.) eine Partner-Jury sieht und bewertet nur die Teams ihrer eigenen Challenge.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_org uuid; v_oe uuid; v_org2 uuid; v_t3 uuid;
        v_c1 uuid; v_c2 uuid; v_t1 uuid; v_t2 uuid; v_code text; v_n integer; v_txt text;
        v_p record; v_total numeric; v_extra uuid;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';

  -- 01a ohne Anmeldung
  begin
    perform my_hack(v_ed);
    insert into t_res values ('01a_ohne_login', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('01a_ohne_login', 'abgewiesen ' || sqlstate); end;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 01b Team-RPC ohne Rolle
  begin
    perform hack_admin_overview(v_ed);
    insert into t_res values ('01b_team_rpc', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('01b_team_rpc', 'abgewiesen ' || sqlstate); end;

  -- 02 unbekannter Skill
  begin
    perform apply_hackathon(jsonb_build_object('edition_id', v_ed, 'skills', jsonb_build_array('zaubern')));
    insert into t_res values ('02_skill', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('02_skill', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;
  perform apply_hackathon(jsonb_build_object('edition_id', v_ed, 'skills', jsonb_build_array('backend'),
                                             'motivation', 'Test'));

  -- 03 Team anlegen
  v_t1 := create_hack_team('ZZTEST Team Eins', v_ed);
  select is_captain into v_txt from hack_team_member where team_id = v_t1 and person_id = v_pid;
  insert into t_res values ('03a_kapitaen', v_txt);
  begin
    perform create_hack_team('ZZTEST Team Zwei', v_ed);
    insert into t_res values ('03b_zweites_team', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('03b_zweites_team', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  -- 04 Beitritt und Maximum
  select join_code into v_code from hack_team where id = v_t1;
  for v_n in 1..8 loop
    insert into person (first_name, last_name) values ('ZZTEST', 'Hacker ' || v_n) returning id into v_extra;
    begin
      insert into hack_team_member (team_id, person_id, edition_id) values (v_t1, v_extra, v_ed);
    exception when others then
      insert into t_res values ('04_team_voll', 'bei Mitglied ' || (v_n + 1) || ': ' || sqlerrm);
      exit;
    end;
  end loop;
  select count(*) into v_n from hack_team_member where team_id = v_t1;
  insert into t_res values ('04b_mitglieder', v_n::text);

  -- 05 Einreichung mit zu kleinem Team
  v_t2 := null;
  delete from hack_team_member where team_id = v_t1 and person_id <> v_pid;
  begin
    perform submit_hack(jsonb_build_object('edition_id', v_ed, 'url', 'https://example.org'));
    insert into t_res values ('05_zu_klein', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('05_zu_klein', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  -- Team-Rolle für die nächsten Schritte
  insert into role_assignment (person_id, role, scope_type, edition_id, valid_from)
  values (v_pid, 'area_lead_hackathon', 'edition', v_ed, now() - interval '1 day');

  -- 06 Challenges verteilen
  select o.id into v_org from organization o limit 1;
  insert into hack_challenge (edition_id, org_id, title_en, status, criteria)
  values (v_ed, v_org, 'ZZTEST Challenge A', 'published',
          jsonb_build_array(jsonb_build_object('key','c1','label','Innovation','weight',70),
                            jsonb_build_object('key','c2','label','Pitch','weight',30)))
  returning id into v_c1;
  insert into hack_challenge (edition_id, org_id, title_en, status)
  values (v_ed, v_org, 'ZZTEST Challenge B', 'published') returning id into v_c2;

  insert into person (first_name, last_name) values ('ZZTEST', 'Zweitkapitaen') returning id into v_extra;
  insert into hack_team (edition_id, name, join_code, created_by)
  values (v_ed, 'ZZTEST Team Zwei', 'ZZTST2', v_extra) returning id into v_t2;
  insert into hack_team_member (team_id, person_id, edition_id, is_captain)
  values (v_t2, v_extra, v_ed, true);

  select assign_challenges(v_ed) into v_n;
  insert into t_res values ('06_verteilt', v_n || ' Teams, A=' ||
    (select count(*) from hack_team where challenge_id = v_c1) || ' B=' ||
    (select count(*) from hack_team where challenge_id = v_c2) ||
    ' zweiter_lauf=' || assign_challenges(v_ed));

  -- 07 Verlassen
  perform leave_hack_team(v_ed);
  select status into v_txt from hack_team where id = v_t1;
  insert into t_res values ('07_letztes_mitglied', v_txt);

  -- 08 Judging
  update hack_team set challenge_id = v_c1 where id = v_t2;
  select set_hack_score(v_t2, jsonb_build_object('c1', 8, 'c2', 4), 'solide') into v_total;
  insert into t_res values ('08a_gewichtet', v_total::text || ' (erwartet 6.80)');
  begin
    perform set_hack_score(v_t2, jsonb_build_object('c1', 42));
    insert into t_res values ('08b_zu_hoch', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('08b_zu_hoch', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  -- 10 Partner-Jury sieht nur die eigene Challenge (Review 14.09.)
  select o.id into v_org2 from organization o where o.id <> v_org order by o.created_at limit 1;
  if v_org2 is null then
    insert into t_res values ('10_partner_jury', 'uebersprungen (nur eine Organisation)');
  else
    update hack_challenge set org_id = v_org2 where id = v_c2;
    insert into hack_team (edition_id, name, join_code, created_by, challenge_id)
    values (v_ed, 'ZZTEST Team Drei', 'ZZTST3', v_extra, v_c2) returning id into v_t3;
    delete from role_assignment where person_id = v_pid;
    insert into role_assignment (person_id, role, scope_type, scope_id, valid_from)
    values (v_pid, 'hackathon_partner', 'org', v_org, now() - interval '1 day');
    insert into org_membership (person_id, org_id, roles) values (v_pid, v_org, '{}') on conflict do nothing;
    insert into t_res values ('10a_partner_sieht',
      'eigene=' || (select count(*) from hack_judging(v_ed) where team_id = v_t2) ||
      ' fremde=' || (select count(*) from hack_judging(v_ed) where team_id = v_t3));
    begin
      perform set_hack_score(v_t3, jsonb_build_object('c1', 5));
      insert into t_res values ('10b_fremdes_team_bewerten', 'ALLOWED (BUG)');
    exception when others then insert into t_res values ('10b_fremdes_team_bewerten', 'abgewiesen ' || sqlstate); end;
    select set_hack_score(v_t2, jsonb_build_object('c1', 7, 'c2', 7), 'ok') into v_total;
    insert into t_res values ('10c_eigenes_team_bewerten', coalesce(v_total::text, 'null'));
    insert into t_res values ('10d_hilfsfunktionen',
      'join_code=' || has_function_privilege('authenticated', 'hack_join_code()', 'execute')::text ||
      ' trigger=' || has_function_privilege('authenticated', 'trg_hack_team_size()', 'execute')::text);
  end if;

  -- 09 Grants
  select count(*) into v_n from information_schema.role_table_grants
   where table_name in ('hack_challenge','hack_team','hack_team_member','hack_application','hack_submission','hack_judging_score')
     and grantee in ('anon', 'authenticated');
  insert into t_res values ('09_grants', case when v_n = 0 then 'keine' else v_n || ' (BUG)' end);
end $$;

select * from t_res order by step;
rollback;

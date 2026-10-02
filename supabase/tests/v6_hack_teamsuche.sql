-- Test „Teamsuche“ (HACK-016, 20261002083729_v6_hack_teamsuche.sql). Belegt:
--   01 Tabelle ohne Grants; Spalten mit Prüfsatz;
--   02 Nicht-Teilnehmende (keine angenommene Bewerbung, kein Team): Teamliste 42501,
--      set_hack_seeking 42501, request_hack_join 42501;
--   03 Kapitän markiert „suchen noch“ mit Skills; Nicht-Kapitän 42501 not_captain;
--      unbekannter Skill 22023;
--   04 Teilnehmerin ohne Team sieht das Team mit freien Plätzen; Team ohne „suchen“ fehlt;
--   05 Personenliste nur für Teammitglieder: Vorname, Studienfeld, Skills, Track-Wunsch — die
--      Spaltenliste enthält weder Nachname noch Kontaktdaten; Person ohne „suche Team“ fehlt;
--   06 Anfrage ans Team: doppelt 22023/P0001 request_pending; Antwort nur Kapitän (fremde
--      Person 42501); Zusage ⇒ Mitglied, seeking_team aus, übrige Anfragen zurückgezogen, Audit;
--   07 Einladung durch den Kapitän: nur an Personen mit „suche Team“; Ablehnung durch die Person;
--      erneute Antwort P0001 request_closed; Zurückziehen nur durch den Kapitän;
--   08 volles Team (8) ⇒ Zusage scheitert mit team_full; anon ohne EXECUTE;
--   09 Anfrage ans Team, Team hört auf zu suchen ⇒ Zusage scheitert mit team_not_looking.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_cap uuid; v_cap_uid uuid; v_mem uuid; v_mem_uid uuid; v_solo uuid; v_solo_uid uuid;
  v_solo2 uuid; v_solo2_uid uuid; v_out uuid; v_out_uid uuid;
  v_ed uuid; v_t uuid; v_t2 uuid; v_t3 uuid; v_r uuid; v_r2 uuid; v_r3 uuid; v_s text; v_n integer; r record; i integer;
begin
  select p.id, p.auth_user_id into v_cap, v_cap_uid from person p where p.auth_user_id is not null and p.deleted_at is null order by p.created_at offset 0 limit 1;
  select p.id, p.auth_user_id into v_mem, v_mem_uid from person p where p.auth_user_id is not null and p.deleted_at is null order by p.created_at offset 1 limit 1;
  select p.id, p.auth_user_id into v_solo, v_solo_uid from person p where p.auth_user_id is not null and p.deleted_at is null order by p.created_at offset 2 limit 1;
  select p.id, p.auth_user_id into v_solo2, v_solo2_uid from person p where p.auth_user_id is not null and p.deleted_at is null order by p.created_at offset 3 limit 1;
  select p.id, p.auth_user_id into v_out, v_out_uid from person p where p.auth_user_id is not null and p.deleted_at is null order by p.created_at offset 4 limit 1;
  v_ed := hack_edition(null);
  delete from hack_team_member where person_id in (v_cap, v_mem, v_solo, v_solo2, v_out);
  delete from hack_application where person_id in (v_cap, v_mem, v_solo, v_solo2, v_out) and edition_id = v_ed;
  insert into hack_application (person_id, edition_id, skills, status, track_prefs)
    select x, v_ed, '{}', 'accepted', '{}' from unnest(array[v_cap, v_mem, v_solo, v_solo2]) x;
  update hack_application set skills = (select array_agg(key) from (select key from vocab_term where vocabulary = 'hack_skill' and active order by sort_order limit 1) k),
                              track_prefs = '{data_science}' where person_id = v_solo and edition_id = v_ed;
  insert into hack_team (edition_id, name, join_code) values (v_ed, 'ZZ Suche', 'ZZSUC1') returning id into v_t;
  insert into hack_team (edition_id, name, join_code) values (v_ed, 'ZZ Still', 'ZZSUC2') returning id into v_t2;
  insert into hack_team_member (team_id, person_id, edition_id, is_captain) values (v_t, v_cap, v_ed, true), (v_t, v_mem, v_ed, false);

  -- 01
  insert into t_res values ('01_grants',
    case when not has_table_privilege('authenticated', 'hack_join_request', 'select')
          and not has_table_privilege('authenticated', 'hack_join_request', 'insert')
         then 'ok' else 'FEHLER' end);

  -- 02 Nicht-Teilnehmende
  perform set_config('request.jwt.claims', json_build_object('sub', v_out_uid, 'role', 'authenticated')::text, true);
  v_s := '';
  begin perform * from hack_team_search(); v_s := 'ALLOWED (BUG)';
  exception when others then v_s := case when sqlstate = '42501' then 'ok' else sqlstate end; end;
  begin perform set_hack_seeking(true); v_s := v_s || '/ALLOWED (BUG)';
  exception when others then v_s := v_s || case when sqlstate = '42501' then '/ok' else '/' || sqlstate end; end;
  begin perform request_hack_join(v_t); v_s := v_s || '/ALLOWED (BUG)';
  exception when others then v_s := v_s || case when sqlstate = '42501' then '/ok' else '/' || sqlstate end; end;
  insert into t_res values ('02_nicht_teilnehmend', case when v_s = 'ok/ok/ok' then 'ok' else v_s end);

  -- 03 Markieren
  perform set_config('request.jwt.claims', json_build_object('sub', v_mem_uid, 'role', 'authenticated')::text, true);
  begin perform set_hack_team_looking(true); v_s := 'ALLOWED (BUG)';
  exception when others then v_s := case when sqlstate = '42501' and sqlerrm = 'not_captain' then 'ok' else sqlstate end; end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_cap_uid, 'role', 'authenticated')::text, true);
  begin perform set_hack_team_looking(true, array['gibtsnicht']); v_s := v_s || '/ALLOWED (BUG)';
  exception when others then v_s := v_s || case when sqlstate = '22023' then '/ok' else '/' || sqlstate end; end;
  perform set_hack_team_looking(true, (select array_agg(key) from (select key from vocab_term where vocabulary = 'hack_skill' and active order by sort_order limit 2) k), 'Wir suchen jemanden für Daten');
  insert into t_res values ('03_markieren',
    case when v_s = 'ok/ok' and (select looking and cardinality(looking_skills) = 2 from hack_team where id = v_t) then 'ok' else v_s end);

  -- 04 Teamliste
  perform set_config('request.jwt.claims', json_build_object('sub', v_solo_uid, 'role', 'authenticated')::text, true);
  perform set_hack_seeking(true);
  select string_agg(s.team_name || ':' || s.free_slots, ',') into v_s from hack_team_search() s where s.team_id in (v_t, v_t2);
  insert into t_res values ('04_teamliste', case when v_s = 'ZZ Suche:6' then 'ok' else coalesce(v_s, 'leer') end);

  -- 05 Personenliste
  perform set_config('request.jwt.claims', json_build_object('sub', v_solo2_uid, 'role', 'authenticated')::text, true);
  begin perform * from hack_people_search(); v_s := 'ALLOWED (BUG)';
  exception when others then v_s := case when sqlstate = '42501' then 'ok' else sqlstate end; end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_mem_uid, 'role', 'authenticated')::text, true);
  select * into r from hack_people_search() p where p.person_id = v_solo;
  select count(*) into v_n from hack_people_search() p where p.person_id = v_solo2;
  insert into t_res values ('05_personenliste',
    case when v_s = 'ok' and r.person_id = v_solo and r.track_prefs = '{data_science}' and cardinality(r.skills) = 1 and v_n = 0
          and pg_get_function_result('hack_people_search(uuid)'::regprocedure) !~* 'last_name|mail|phone|linkedin|url'
         then 'ok' else v_s || ' ' || coalesce(r::text, 'leer') || ' solo2=' || v_n end);

  -- 06 Anfrage ans Team
  perform set_config('request.jwt.claims', json_build_object('sub', v_solo_uid, 'role', 'authenticated')::text, true);
  v_r := request_hack_join(v_t, 'Hallo, ich mag Daten');
  begin perform request_hack_join(v_t); v_s := 'ALLOWED (BUG)';
  exception when others then v_s := case when sqlerrm = 'request_pending' then 'ok' else sqlstate end; end;
  insert into hack_team (edition_id, name, join_code, looking) values (v_ed, 'ZZ Zweitwahl', 'ZZSUC3', true) returning id into v_t3;
  v_r2 := request_hack_join(v_t3);
  perform set_config('request.jwt.claims', json_build_object('sub', v_mem_uid, 'role', 'authenticated')::text, true);
  begin perform answer_hack_request(v_r, true); v_s := v_s || '/ALLOWED (BUG)';
  exception when others then v_s := v_s || case when sqlstate = '42501' then '/ok' else '/' || sqlstate end; end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_cap_uid, 'role', 'authenticated')::text, true);
  select count(*) into v_n from my_hack_requests() m where m.request_id = v_r and m.mine_to_answer;
  perform answer_hack_request(v_r, true);
  insert into t_res values ('06_anfrage_zusage',
    case when v_s = 'ok/ok' and v_n = 1
          and exists (select 1 from hack_team_member where team_id = v_t and person_id = v_solo)
          and not (select seeking_team from hack_application where person_id = v_solo and edition_id = v_ed)
          and (select status from hack_join_request where id = v_r2) = 'withdrawn'
          and exists (select 1 from audit_log a where a.action = 'hack.join_accepted' and a.object_id = v_t::text)
         then 'ok' else v_s || ' n=' || v_n end);

  -- 07 Einladung
  begin perform invite_hack_person(v_solo2); v_s := 'ALLOWED (BUG)';
  exception when others then v_s := case when sqlerrm = 'person_not_seeking' then 'ok' else sqlstate end; end;
  update hack_application set seeking_team = true where person_id = v_solo2 and edition_id = v_ed;
  v_r3 := invite_hack_person(v_solo2, 'Komm zu uns');
  perform set_config('request.jwt.claims', json_build_object('sub', v_solo2_uid, 'role', 'authenticated')::text, true);
  begin perform withdraw_hack_request(v_r3); v_s := v_s || '/ALLOWED (BUG)';
  exception when others then v_s := v_s || case when sqlstate = '42501' then '/ok' else '/' || sqlstate end; end;
  perform answer_hack_request(v_r3, false);
  begin perform answer_hack_request(v_r3, true); v_s := v_s || '/ALLOWED (BUG)';
  exception when others then v_s := v_s || case when sqlerrm = 'request_closed' then '/ok' else '/' || sqlstate end; end;
  insert into t_res values ('07_einladung',
    case when v_s = 'ok/ok/ok' and (select status from hack_join_request where id = v_r3) = 'declined'
          and not exists (select 1 from hack_team_member where person_id = v_solo2 and edition_id = v_ed)
         then 'ok' else v_s end);

  -- 08 volles Team
  perform set_config('request.jwt.claims', null, true);
  insert into hack_team_member (team_id, person_id, edition_id)
    select v_t, p.id, v_ed from person p
     where p.deleted_at is null and p.id not in (v_cap, v_mem, v_solo, v_solo2, v_out)
       and not exists (select 1 from hack_team_member m where m.person_id = p.id and m.edition_id = v_ed)
     order by p.created_at limit 5;
  select count(*) into v_n from hack_team_member where team_id = v_t;
  perform set_config('request.jwt.claims', json_build_object('sub', v_cap_uid, 'role', 'authenticated')::text, true);
  v_r3 := invite_hack_person(v_solo2);
  perform set_config('request.jwt.claims', json_build_object('sub', v_solo2_uid, 'role', 'authenticated')::text, true);
  begin perform answer_hack_request(v_r3, true); v_s := 'ALLOWED (BUG)';
  exception when others then v_s := case when sqlerrm = 'team_full' then 'ok' else sqlstate || ' ' || sqlerrm end; end;
  insert into t_res values ('08_voll_anon',
    case when v_n = 8 and v_s = 'ok'
          and not has_function_privilege('anon', 'request_hack_join(uuid,text)', 'execute')
          and not has_function_privilege('anon', 'hack_people_search(uuid)', 'execute')
          and not has_function_privilege('anon', 'answer_hack_request(uuid,boolean)', 'execute')
         then 'ok' else 'n=' || v_n || ' ' || v_s end);

  -- 09 Team sucht nicht mehr
  perform set_config('request.jwt.claims', null, true);
  update hack_team set looking = true where id = v_t2;
  insert into hack_team_member (team_id, person_id, edition_id, is_captain) values (v_t2, v_out, v_ed, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_solo2_uid, 'role', 'authenticated')::text, true);
  v_r := request_hack_join(v_t2);
  perform set_config('request.jwt.claims', json_build_object('sub', v_out_uid, 'role', 'authenticated')::text, true);
  perform set_hack_team_looking(false);
  begin perform answer_hack_request(v_r, true); v_s := 'ALLOWED (BUG)';
  exception when others then v_s := case when sqlerrm = 'team_not_looking' then 'ok' else sqlstate || ' ' || sqlerrm end; end;
  insert into t_res values ('09_nicht_mehr_suchend', v_s);
end $$;
select * from t_res order by step;
rollback;

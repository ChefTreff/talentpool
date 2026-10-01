-- Test „Track-Präferenz“ (HACK-010, 20261001123445_v6_hack_track_praeferenz.sql; setzt
-- v6_hack_tracks voraus). Belegt:
--   01 Bewerbung ohne Track-Wunsch ⇒ 22023 track_pref_missing;
--   02 unbekannter Track ⇒ 22023 invalid_vocab_value (detail track_prefs); mehr als drei ⇒ dito;
--   03 gültige Wünsche werden ohne Doppelte in Reihenfolge gespeichert, my_hack liefert sie;
--   04 erneutes Bewerben ersetzt die Wünsche;
--   05 hack_applications_admin: Track-Wünsche und Profilmerkmale (Studienfeld, Studiengang,
--      Abschlussjahr, Profil-Skills) für das Hackathon-Team; ohne Rolle 42501;
--   06 Team einer früheren Edition erzeugt keine Doppelzeile mehr;
--   07 Spalten ohne E-Mail/Telefon; anon ohne EXECUTE.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_me uuid; v_me_uid uuid; v_ed uuid; v_old_ed uuid; v_team uuid;
  v_s text; v_n integer; v_j jsonb; r record;
begin
  -- Bewerbende Person (eigenes Konto) und Prüfperson fürs Team
  select p.id, p.auth_user_id into v_me, v_me_uid from person p
   where p.auth_user_id is not null and p.deleted_at is null order by p.created_at limit 1;
  select p.id, p.auth_user_id into v_pid, v_uid from person p
   where p.auth_user_id is not null and p.deleted_at is null and p.id <> v_me order by p.created_at limit 1;
  v_ed := hack_edition(null);
  delete from role_assignment where person_id in (v_pid, v_me);
  delete from hack_team_member where person_id = v_me;
  delete from hack_application where person_id = v_me;
  update person set study_field = coalesce(study_field, (select key from vocab_term where vocabulary = 'study_field' limit 1)),
                    study_program_label = 'Wirtschaftsinformatik (Test)', graduation_year = 2027
   where id = v_me;
  delete from person_interest where person_id = v_me and vocabulary = 'skill';
  insert into person_interest (person_id, vocabulary, term_key)
    select v_me, 'skill', key from vocab_term where vocabulary = 'skill' and key = 'data_analysis';

  perform set_config('request.jwt.claims', json_build_object('sub', v_me_uid, 'role', 'authenticated')::text, true);

  -- 01
  begin perform apply_hackathon('{"skills":[],"motivation":"x"}'::jsonb); v_s := 'ALLOWED (BUG)';
  exception when others then v_s := case when sqlstate = '22023' and sqlerrm = 'track_pref_missing' then 'ok' else sqlstate || ' ' || sqlerrm end; end;
  insert into t_res values ('01_ohne_wunsch', v_s);

  -- 02
  begin perform apply_hackathon('{"track_prefs":["quantum"]}'::jsonb); v_s := 'ALLOWED (BUG)';
  exception when others then v_s := case when sqlstate = '22023' and sqlerrm = 'invalid_vocab_value' then 'ok' else sqlstate end; end;
  begin
    insert into vocab_term (vocabulary, key, label_de, label_en, sort_order) values ('hack_track', 'zz_vier', 'Vier', 'Four', 99);
    perform apply_hackathon('{"track_prefs":["concept","data_science","physical_ai","zz_vier"]}'::jsonb); v_s := v_s || '/ALLOWED (BUG)';
  exception when others then v_s := v_s || case when sqlstate = '22023' then '/ok' else '/' || sqlstate end; end;
  insert into t_res values ('02_ungueltig', case when v_s = 'ok/ok' then 'ok' else v_s end);

  -- 03
  perform apply_hackathon('{"track_prefs":["concept","data_science","concept"],"motivation":"Test HACK-010"}'::jsonb);
  v_j := my_hack();
  insert into t_res values ('03_gespeichert',
    case when (select track_prefs from hack_application where person_id = v_me and edition_id = v_ed) = '{concept,data_science}'
          and v_j->'application'->'track_prefs' = '["concept","data_science"]'::jsonb
         then 'ok' else coalesce(v_j->'application'->>'track_prefs', 'leer') end);

  -- 04
  perform apply_hackathon('{"track_prefs":["physical_ai"]}'::jsonb);
  insert into t_res values ('04_ersetzt',
    case when (select track_prefs from hack_application where person_id = v_me and edition_id = v_ed) = '{physical_ai}'
         then 'ok' else 'FEHLER' end);

  -- 06 Vorbereitung: Team derselben Person in einer anderen Edition (Serverkontext)
  perform set_config('request.jwt.claims', null, true);
  select e.id into v_old_ed from event e where e.id <> v_ed limit 1;
  if v_old_ed is not null then
    insert into hack_team (edition_id, name, join_code) values (v_old_ed, 'Altes Team (Test)', 'ZZOLD1') returning id into v_team;
    insert into hack_team_member (team_id, person_id, edition_id) values (v_team, v_me, v_old_ed);
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

  -- 05 ohne Rolle, dann mit
  begin perform * from hack_applications_admin(); v_s := 'ALLOWED (BUG)';
  exception when others then v_s := case when sqlstate = '42501' then 'ok' else sqlstate end; end;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'hackathon_team', 'global');
  select * into r from hack_applications_admin() a where a.person_id = v_me;
  insert into t_res values ('05_admin_profil',
    case when v_s = 'ok' and r.track_prefs = '{physical_ai}' and r.study_program_label = 'Wirtschaftsinformatik (Test)'
          and r.graduation_year = 2027 and r.study_field is not null and r.profile_skills = '{data_analysis}'
         then 'ok' else v_s || ' ' || coalesce(r::text, 'leer') end);

  -- 06
  select count(*) into v_n from hack_applications_admin() a where a.person_id = v_me;
  insert into t_res values ('06_keine_doppelzeile',
    case when v_team is null then 'Vorbedingung fehlt (keine zweite Edition)'
         when v_n = 1 and (select a.team_name from hack_applications_admin() a where a.person_id = v_me) is null
         then 'ok' else 'n=' || v_n end);

  -- 07
  insert into t_res values ('07_spalten_grants',
    case when pg_get_function_result('hack_applications_admin(uuid)'::regprocedure) !~* 'mail|phone'
          and not has_function_privilege('anon', 'hack_applications_admin(uuid)', 'execute')
          and not has_function_privilege('anon', 'apply_hackathon(jsonb)', 'execute')
          and not has_function_privilege('anon', 'my_hack(uuid,text)', 'execute')
         then 'ok' else 'FEHLER' end);
end $$;
select * from t_res order by step;
rollback;

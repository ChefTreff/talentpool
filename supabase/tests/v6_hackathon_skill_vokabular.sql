-- Test „Hackathon-Skills auf `skill`“ (K-94 Stufe 1 Teil B, vorschlag/v6_hackathon_skill_vokabular.sql). Belegt:
--   01 `apply_hackathon` nimmt Schlüssel aus `skill` an (programming, ai_ml) und lehnt einen alten Schlüssel (frontend) mit 22023 invalid_skill ab;
--   02 `set_hack_team_looking` ebenso: neue Schlüssel gehen, alter Schlüssel 22023 invalid_skill, mehr als 8 → 22023;
--   03 Bestand: nirgends mehr ein alter Schlüssel, der kein `skill`-Schlüssel ist (Bewerbungen, Teams);
--   04 die Gruppe `hack_skill` ist inaktiv und nichts gelöscht (alle sechs Einträge da).
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_cap uuid; v_cap_uid uuid; v_ed uuid; v_t uuid; v_s text; v_n integer;
begin
  select p.id, p.auth_user_id into v_cap, v_cap_uid from person p where p.auth_user_id is not null and p.deleted_at is null order by p.created_at offset 0 limit 1;
  v_ed := hack_edition(null);
  delete from hack_team_member where person_id = v_cap;
  delete from hack_application where person_id = v_cap and edition_id = v_ed;
  insert into hack_team (edition_id, name, join_code) values (v_ed, 'ZZ Skill', 'ZZSKL1') returning id into v_t;
  insert into hack_team_member (team_id, person_id, edition_id, is_captain) values (v_t, v_cap, v_ed, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_cap_uid, 'role', 'authenticated')::text, true);

  -- 01
  perform apply_hackathon(jsonb_build_object('skills', jsonb_build_array('programming', 'ai_ml'), 'track_prefs', (select jsonb_agg(key) from (select key from vocab_term where vocabulary = 'hack_track' and active order by sort_order limit 1) k)));
  begin perform apply_hackathon(jsonb_build_object('skills', jsonb_build_array('frontend'), 'track_prefs', (select jsonb_agg(key) from (select key from vocab_term where vocabulary = 'hack_track' and active order by sort_order limit 1) k)));
    v_s := 'ALLOWED (BUG)';
  exception when others then v_s := case when sqlstate = '22023' and sqlerrm = 'invalid_skill' then 'ok' else sqlstate || ' ' || sqlerrm end; end;
  insert into t_res values ('01_bewerbung', case when v_s = 'ok' and (select skills from hack_application where person_id = v_cap and edition_id = v_ed) = array['programming', 'ai_ml'] then 'ok' else v_s end);

  -- 02
  perform set_hack_team_looking(true, array['programming', 'design'], 'TEST');
  begin perform set_hack_team_looking(true, array['backend']); v_s := 'ALLOWED (BUG)';
  exception when others then v_s := case when sqlstate = '22023' and sqlerrm = 'invalid_skill' then 'ok' else sqlstate || ' ' || sqlerrm end; end;
  begin perform set_hack_team_looking(true, (select array_agg(key) from (select key from vocab_term where vocabulary = 'skill' order by sort_order limit 9) k)); v_s := v_s || '/ALLOWED (BUG)';
  exception when others then v_s := v_s || case when sqlstate = '22023' then '/ok' else '/' || sqlstate end; end;
  insert into t_res values ('02_teamsuche', case when v_s = 'ok/ok' and (select looking_skills from hack_team where id = v_t) = array['design', 'programming'] then 'ok' else v_s || ' ' || coalesce((select looking_skills::text from hack_team where id = v_t), '') end);

  -- 03
  select count(*) into v_n from (
    select unnest(skills) s from hack_application union all select unnest(looking_skills) from hack_team) x
   where s in (select key from vocab_term where vocabulary = 'hack_skill') and s not in (select key from vocab_term where vocabulary = 'skill');
  insert into t_res values ('03_bestand', case when v_n = 0 then 'ok' else 'ALT: ' || v_n end);

  -- 04
  insert into t_res values ('04_gruppe_inaktiv',
    case when (select count(*) from vocab_term where vocabulary = 'hack_skill') = 6
          and (select count(*) from vocab_term where vocabulary = 'hack_skill' and active) = 0 then 'ok' else 'FEHLER' end);
end $$;
select * from t_res order by step;
rollback;

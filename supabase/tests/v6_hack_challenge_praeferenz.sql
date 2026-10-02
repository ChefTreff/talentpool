-- Test „Wunsch-Challenges in der Bewerbung“ (HACK-017, vorschlag/v6_hack_challenge_praeferenz.sql). Belegt:
--   01 drei Wünsche in Reihenfolge gespeichert, Doppelte fallen weg;
--   02 mehr als drei, Entwurf (nicht freigegeben), fremde Edition, keine UUID ⇒ 22023 invalid_challenge;
--   03 ohne Wünsche geht die Bewerbung weiter (freiwillig), erneutes Bewerben ersetzt;
--   04 hack_applications_admin liefert die Wünsche fürs Hack-Team; ohne Rolle 42501; Prüfsatz ≤ 3.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_me uuid; v_uid uuid; v_staff uuid; v_staff_uid uuid; v_ed uuid; v_other uuid;
  v_a uuid; v_b uuid; v_c uuid; v_d uuid; v_draft uuid; v_fremd uuid; v_s text; r record;
begin
  select p.id, p.auth_user_id into v_me, v_uid from person p where p.auth_user_id is not null and p.deleted_at is null order by p.created_at offset 0 limit 1;
  select p.id, p.auth_user_id into v_staff, v_staff_uid from person p where p.auth_user_id is not null and p.deleted_at is null order by p.created_at offset 1 limit 1;
  delete from role_assignment where person_id in (v_me, v_staff);
  v_ed := hack_edition(null);
  select e.id into v_other from event e where e.id <> v_ed limit 1;
  delete from hack_application where person_id = v_me and edition_id = v_ed;
  insert into hack_challenge (edition_id, title_en, mentors, criteria, status) values (v_ed, 'ZZ A', '[]', '[]', 'published') returning id into v_a;
  insert into hack_challenge (edition_id, title_en, mentors, criteria, status) values (v_ed, 'ZZ B', '[]', '[]', 'published') returning id into v_b;
  insert into hack_challenge (edition_id, title_en, mentors, criteria, status) values (v_ed, 'ZZ C', '[]', '[]', 'published') returning id into v_c;
  insert into hack_challenge (edition_id, title_en, mentors, criteria, status) values (v_ed, 'ZZ D', '[]', '[]', 'published') returning id into v_d;
  insert into hack_challenge (edition_id, title_en, mentors, criteria, status) values (v_ed, 'ZZ Entwurf', '[]', '[]', 'draft') returning id into v_draft;
  insert into hack_challenge (edition_id, title_en, mentors, criteria, status) values (v_other, 'ZZ Fremd', '[]', '[]', 'published') returning id into v_fremd;

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

  -- 01
  perform apply_hackathon(jsonb_build_object('track_prefs', '["concept"]'::jsonb,
    'challenge_prefs', jsonb_build_array(v_b, v_a, v_b, v_c)));
  insert into t_res values ('01_reihenfolge',
    case when (select challenge_prefs from hack_application where person_id = v_me and edition_id = v_ed) = array[v_b, v_a, v_c]
         then 'ok' else coalesce((select challenge_prefs::text from hack_application where person_id = v_me and edition_id = v_ed), 'leer') end);

  -- 02
  v_s := '';
  begin perform apply_hackathon(jsonb_build_object('track_prefs', '["concept"]'::jsonb, 'challenge_prefs', jsonb_build_array(v_a, v_b, v_c, v_d))); v_s := 'ALLOWED (BUG)';
  exception when others then v_s := case when sqlerrm = 'invalid_challenge' then 'ok' else sqlstate end; end;
  begin perform apply_hackathon(jsonb_build_object('track_prefs', '["concept"]'::jsonb, 'challenge_prefs', jsonb_build_array(v_draft))); v_s := v_s || '/ALLOWED (BUG)';
  exception when others then v_s := v_s || case when sqlerrm = 'invalid_challenge' then '/ok' else '/' || sqlstate end; end;
  begin perform apply_hackathon(jsonb_build_object('track_prefs', '["concept"]'::jsonb, 'challenge_prefs', jsonb_build_array(v_fremd))); v_s := v_s || '/ALLOWED (BUG)';
  exception when others then v_s := v_s || case when sqlerrm = 'invalid_challenge' then '/ok' else '/' || sqlstate end; end;
  begin perform apply_hackathon('{"track_prefs":["concept"],"challenge_prefs":["keine-uuid"]}'::jsonb); v_s := v_s || '/ALLOWED (BUG)';
  exception when others then v_s := v_s || case when sqlerrm = 'invalid_challenge' then '/ok' else '/' || sqlstate || ' ' || sqlerrm end; end;
  insert into t_res values ('02_ungueltig', case when v_s = 'ok/ok/ok/ok' then 'ok' else v_s end);

  -- 03
  perform apply_hackathon('{"track_prefs":["concept"]}'::jsonb);
  insert into t_res values ('03_freiwillig_ersetzt',
    case when (select cardinality(challenge_prefs) from hack_application where person_id = v_me and edition_id = v_ed) = 0
         then 'ok' else 'FEHLER' end);
  perform apply_hackathon(jsonb_build_object('track_prefs', '["concept"]'::jsonb, 'challenge_prefs', jsonb_build_array(v_d)));

  -- 04
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff_uid, 'role', 'authenticated')::text, true);
  begin perform * from hack_applications_admin(); v_s := 'ALLOWED (BUG)';
  exception when others then v_s := case when sqlstate = '42501' then 'ok' else sqlstate end; end;
  insert into role_assignment (person_id, role, scope_type) values (v_staff, 'hackathon_team', 'global');
  select * into r from hack_applications_admin() a where a.person_id = v_me;
  begin
    update hack_application set challenge_prefs = array[v_a, v_b, v_c, v_d] where person_id = v_me and edition_id = v_ed;
    v_s := v_s || '/ALLOWED (BUG)';
  exception when check_violation then v_s := v_s || '/ok'; end;
  insert into t_res values ('04_admin',
    case when v_s = 'ok/ok' and r.challenge_prefs = array[v_d]
          and not has_function_privilege('anon', 'hack_applications_admin(uuid)', 'execute')
         then 'ok' else v_s || ' ' || coalesce(r.challenge_prefs::text, 'leer') end);
end $$;
select * from t_res order by step;
rollback;

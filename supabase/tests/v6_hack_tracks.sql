-- Test „Hackathon-Tracks“ (HACK-008, 20261001122557_v6_hack_tracks.sql). Belegt:
--   01 Vokabular hack_track hat drei aktive Begriffe, vocab_binding steht;
--   02 Formular hackathon_challenge hat genau ein Pflichtfeld track (select) direkt hinter
--      description_en, Optionen = englische Bezeichnungen;
--   03 hack_track_key löst Schlüssel, EN- und DE-Bezeichnung auf, Unbekanntes ⇒ null;
--   04 ohne Rolle: publish_hack_challenge und set_hack_challenge_track 42501;
--   05 Freigabe ohne Track (altes Formular) ⇒ 22023 track_missing; mit p_track ⇒ veröffentlicht
--      mit Track; hack_open_challenges liefert den Track aus der Formularantwort;
--   06 Formularantwort „Data science“ ⇒ Track data_science ohne p_track;
--   07 unbekannter Track ⇒ 22023 invalid_vocab_value; set_hack_challenge_track ändert, Audit;
--   08 hack_challenges liefert track; anon ohne EXECUTE auf den neuen/geänderten Funktionen.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_ed uuid; v_org uuid; v_oe uuid; v_tpl uuid;
  v_d1 uuid; v_d2 uuid; v_c1 uuid; v_c2 uuid; v_s text; v_n integer; v_schema jsonb;
begin
  select p.id, p.auth_user_id into v_pid, v_uid from person p where p.auth_user_id is not null and p.deleted_at is null limit 1;
  v_ed := hack_edition(null);
  delete from role_assignment where person_id = v_pid;

  -- 01
  select count(*) into v_n from vocab_term where vocabulary = 'hack_track' and active;
  insert into t_res values ('01_vokabular',
    case when v_n = 3 and exists (select 1 from vocab_binding where vocabulary = 'hack_track'
                                     and table_name = 'hack_challenge' and column_name = 'track')
         then 'ok' else 'n=' || v_n end);

  -- 02
  select tp.id, tp.answers_schema into v_tpl, v_schema from deliverable_template tp where tp.key = 'hackathon_challenge';
  select string_agg(e.f->>'key', ',' order by e.ord) into v_s from jsonb_array_elements(v_schema) with ordinality e(f, ord);
  insert into t_res values ('02_formularfeld',
    case when v_s like 'title_en,description_en,track,%'
          and (select count(*) from jsonb_array_elements(v_schema) f where f->>'key' = 'track') = 1
          and (select f->>'type' = 'select' and (f->>'required')::boolean
                      and f->'options' = '["Physical AI / robotics simulation","Data science","Concept (idea and slides)"]'::jsonb
                 from jsonb_array_elements(v_schema) f where f->>'key' = 'track')
         then 'ok' else coalesce(v_s, 'leer') end);

  -- 03
  insert into t_res values ('03_track_key',
    case when hack_track_key('concept') = 'concept'
          and hack_track_key(' data SCIENCE ') = 'data_science'
          and hack_track_key('Physical AI / Robotik-Simulation') = 'physical_ai'
          and hack_track_key('Quantencomputing') is null and hack_track_key(null) is null
         then 'ok' else 'FEHLER' end);

  -- Zwei eingereichte Formulare (Serverkontext): eins ohne Track (Altbestand), eins mit.
  insert into organization (legal_name, communication_name, type) values ('Track Alt GmbH', 'TrackAlt', 'corporate') returning id into v_org;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited') returning id into v_oe;
  insert into deliverable (org_edition_id, template_id, key, status, answers, submitted_at)
    values (v_oe, v_tpl, 'hackathon_challenge', 'submitted', '{"title_en":"Alt ohne Track"}'::jsonb, now()) returning id into v_d1;
  insert into organization (legal_name, communication_name, type) values ('Track Neu GmbH', 'TrackNeu', 'corporate') returning id into v_org;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited') returning id into v_oe;
  insert into deliverable (org_edition_id, template_id, key, status, answers, submitted_at)
    values (v_oe, v_tpl, 'hackathon_challenge', 'submitted',
            '{"title_en":"Neu mit Track","track":"Data science"}'::jsonb, now()) returning id into v_d2;

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

  -- 04 ohne Rolle
  v_s := '';
  begin perform publish_hack_challenge(v_d1, 'concept'); v_s := 'ALLOWED (BUG)';
  exception when others then v_s := case when sqlstate = '42501' then 'ok' else sqlstate end; end;
  begin perform set_hack_challenge_track(gen_random_uuid(), 'concept'); v_s := v_s || '/ALLOWED (BUG)';
  exception when others then v_s := v_s || case when sqlstate = '42501' then '/ok' else '/' || sqlstate end; end;
  insert into t_res values ('04_ohne_rolle', case when v_s = 'ok/ok' then 'ok' else v_s end);

  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'hackathon_team', 'global');

  -- 05 Altbestand
  select string_agg(coalesce(c.track, '-'), ',' order by c.title) into v_s
    from hack_open_challenges() c where c.deliverable_id in (v_d1, v_d2);
  begin perform publish_hack_challenge(v_d1); v_s := v_s || '/ALLOWED (BUG)';
  exception when others then
    v_s := v_s || case when sqlstate = '22023' and sqlerrm = 'track_missing' then '/ok' else '/' || sqlstate || ' ' || sqlerrm end; end;
  v_c1 := publish_hack_challenge(v_d1, 'concept');
  insert into t_res values ('05_ohne_track',
    case when v_s = '-,data_science/ok'
          and (select track = 'concept' and status = 'published' from hack_challenge where id = v_c1)
         then 'ok' else v_s end);

  -- 06 Track aus der Formularantwort
  v_c2 := publish_hack_challenge(v_d2);
  insert into t_res values ('06_aus_formular',
    case when (select track from hack_challenge where id = v_c2) = 'data_science' then 'ok'
         else coalesce((select track from hack_challenge where id = v_c2), 'leer') end);

  -- 07 unbekannt, ändern
  v_s := '';
  begin perform publish_hack_challenge(v_d2, 'quantum'); v_s := 'ALLOWED (BUG)';
  exception when others then v_s := case when sqlstate = '22023' and sqlerrm = 'invalid_vocab_value' then 'ok' else sqlstate end; end;
  begin perform set_hack_challenge_track(v_c2, 'quantum'); v_s := v_s || '/ALLOWED (BUG)';
  exception when others then v_s := v_s || case when sqlstate = '22023' then '/ok' else '/' || sqlstate end; end;
  perform set_hack_challenge_track(v_c2, 'physical_ai');
  insert into t_res values ('07_aendern',
    case when v_s = 'ok/ok'
          and (select track from hack_challenge where id = v_c2) = 'physical_ai'
          and exists (select 1 from audit_log a where a.action = 'hack.challenge_track' and a.object_id = v_c2::text)
         then 'ok' else v_s end);

  -- 08
  select string_agg(c.track, ',' order by c.track) into v_s from hack_challenges() c where c.id in (v_c1, v_c2);
  insert into t_res values ('08_liste_grants',
    case when v_s = 'concept,physical_ai'
          and not has_function_privilege('anon', 'publish_hack_challenge(uuid,text)', 'execute')
          and not has_function_privilege('anon', 'set_hack_challenge_track(uuid,text)', 'execute')
          and not has_function_privilege('anon', 'hack_challenges(uuid,text)', 'execute')
          and not has_function_privilege('anon', 'hack_open_challenges(uuid)', 'execute')
          and has_function_privilege('authenticated', 'publish_hack_challenge(uuid,text)', 'execute')
         then 'ok' else coalesce(v_s, 'leer') end);
end $$;
select * from t_res order by step;
rollback;

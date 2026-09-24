-- Smoke-Test zum Vorschlag v6_eine_sprache (SPK-052). Belegt:
--   01 die zwei DEMO-Sessions gibt es — Vorbedingung, sonst wäre 02 auch ohne
--      die Umstellung grün;
--   02 sie stehen auf Deutsch, und keine Session steht mehr auf `mixed`
--      (die Umstellung lief vor dem Verengen — sonst wäre `add constraint`
--      an ihnen gescheitert und der Probelauf gar nicht bis hierher gekommen);
--   03 das Constraint weist `mixed` ab (23514) …
--   04 … und nimmt `en` an;
--   05 `submit_session_content`: `mixed` → 22023 `invalid_language`, `en` geht;
--   06 `partner_update_session`: `mixed` → 22023, **`language: null` → 22023**
--      (gegen live: 23502, NULL rutschte durch das `not in`), `en` geht;
--   07 das Vokabular kennt `mixed` weiter, aber stillgelegt; `de`/`en` aktiv;
--   08 EXECUTE für `authenticated` bleibt an beiden Funktionen.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_ed uuid; v_prof uuid; v_se uuid; v_org uuid; v_n int;
begin
  -- 01 · Vorbedingung
  select count(*) into v_n from session where title_de in ('DEMO Opening', 'DEMO Get-together');
  insert into t_res values ('01_demo_da', case when v_n = 2 then 'ok' else 'FEHLER ' || v_n end);

  -- 02 · Bestand umgestellt
  select count(*) into v_n from session where title_de in ('DEMO Opening', 'DEMO Get-together') and language = 'de';
  insert into t_res values ('02_bestand_de',
    case when v_n = 2 and not exists (select 1 from session where language = 'mixed') then 'ok' else 'FEHLER ' || v_n end);

  -- 03 · Constraint weist mixed ab
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  begin
    insert into session (event_id, format, title_de, language, access_mode, publish_status)
    values (v_ed, 'keynote', 'ZZ Test Sprache gemischt', 'mixed', 'open', 'draft');
    insert into t_res values ('03_constraint_mixed', 'ERLAUBT (BUG)');
  exception when check_violation then
    insert into t_res values ('03_constraint_mixed', 'ok');
  end;

  -- 04 · … nimmt en an
  insert into session (event_id, format, title_de, language, access_mode, publish_status)
  values (v_ed, 'keynote', 'ZZ Test Sprache', 'en', 'open', 'draft')
  returning id into v_se;
  insert into t_res values ('04_constraint_en', case when v_se is not null then 'ok' else 'FEHLER' end);

  -- 05 · submit_session_content als Speaker der Session
  select p.id, p.auth_user_id into v_pid, v_uid from person p where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  select sp.id into v_prof from speaker_profile sp where sp.person_id = v_pid and sp.edition_id = v_ed limit 1;
  if v_prof is null then
    insert into speaker_profile (person_id, edition_id) values (v_pid, v_ed) returning id into v_prof;
  end if;
  insert into session_speaker (session_id, person_id, role, confirmed) values (v_se, v_pid, 'speaker', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  begin
    perform submit_session_content(v_se, '{"title": "ZZ Titel", "language": "mixed"}'::jsonb);
    insert into t_res values ('05_submit_mixed', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('05_submit_mixed',
      case when sqlstate = '22023' and sqlerrm = 'invalid_language' then 'ok' else 'FEHLER ' || sqlstate || ' ' || sqlerrm end);
  end;
  begin
    perform submit_session_content(v_se, '{"title": "ZZ Titel", "language": "en"}'::jsonb);
    insert into t_res values ('05b_submit_en', 'ok');
  exception when others then
    insert into t_res values ('05b_submit_en', 'FEHLER ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 06 · partner_update_session mit Partner-Team-Rolle an einer Partner-Session
  select id into v_org from organization order by created_at limit 1;
  update session set partner_org_id = v_org where id = v_se;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'partner_team', 'global');
  begin
    perform partner_update_session(v_se, '{"language": "mixed"}'::jsonb);
    insert into t_res values ('06_partner_mixed', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('06_partner_mixed',
      case when sqlstate = '22023' and sqlerrm = 'invalid_language' then 'ok' else 'FEHLER ' || sqlstate || ' ' || sqlerrm end);
  end;
  begin
    perform partner_update_session(v_se, '{"language": null}'::jsonb);
    insert into t_res values ('06b_partner_null', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('06b_partner_null',
      case when sqlstate = '22023' and sqlerrm = 'invalid_language' then 'ok' else 'FEHLER ' || sqlstate || ' ' || sqlerrm end);
  end;
  begin
    perform partner_update_session(v_se, '{"language": "en"}'::jsonb);
    insert into t_res values ('06c_partner_en', 'ok');
  exception when others then
    insert into t_res values ('06c_partner_en', 'FEHLER ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 07 · Vokabular
  insert into t_res values ('07_vokabular',
    case when exists (select 1 from vocab_term where vocabulary = 'language' and key = 'mixed' and not active)
          and (select count(*) from vocab_term where vocabulary = 'language' and key in ('de', 'en') and active) = 2
         then 'ok' else 'FEHLER' end);

  -- 08 · Rechte
  insert into t_res values ('08_grants',
    case when has_function_privilege('authenticated', 'submit_session_content(uuid, jsonb)', 'execute')
          and has_function_privilege('authenticated', 'partner_update_session(uuid, jsonb)', 'execute')
         then 'ok' else 'FEHLER' end);
end $$;
select * from t_res order by step;
rollback;

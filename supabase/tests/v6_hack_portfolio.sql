-- Test „Portfolio-Links in der Hackathon-Bewerbung" (HACK-007, vorschlag/v6_hack_portfolio.sql).
-- Belegt:
--   01 Bewerbung mit GitHub, Website, Behance speichert alle drei; my_hack gibt sie zurück;
--   02 falscher Dienst (GitLab im GitHub-Feld), http und javascript: ⇒ 22023 invalid_url
--      mit dem Feld als detail;
--   03 leere Felder entfernen die Links beim erneuten Bewerben;
--   04 die übrigen Felder der Bewerbung bleiben (skills, motivation) — Nebenspalte;
--   05 anonymize_person leert die drei Felder;
--   06 das allgemeine Profil (`person`) hat keine Portfolio-Spalten.
--
-- Probelauf der Build-Session am 01.10.2026 gegen die Live-Datenbank (`sh scripts/db.sh dry-run`,
-- alles zurueckgerollt): 6 von 6 Schritten gruen; fn-diff: nur die beabsichtigten Ersetzungen.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_j jsonb; v_s text; v_detail text; v_bad text; v_skill text;
begin
  select p.id, p.auth_user_id into v_pid, v_uid from person p where p.auth_user_id is not null and p.deleted_at is null limit 1;
  select key into v_skill from vocab_term where vocabulary = 'hack_skill' and active order by sort_order limit 1;
  delete from hack_application where person_id = v_pid;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

  -- 01
  perform apply_hackathon(jsonb_build_object('skills', jsonb_build_array(v_skill), 'motivation', 'Ich will bauen',
            'github_url', 'https://github.com/test', 'website_url', 'https://example.com', 'behance_url', 'https://www.behance.net/test'));
  v_j := my_hack()->'application';
  insert into t_res values ('01_speichern_lesen',
    case when v_j->>'github_url' = 'https://github.com/test' and v_j->>'website_url' = 'https://example.com'
          and v_j->>'behance_url' = 'https://www.behance.net/test' then 'ok' else coalesce(v_j::text, 'leer') end);

  -- 02
  v_s := '';
  foreach v_bad in array array['github_url=https://gitlab.com/x', 'website_url=http://example.com', 'behance_url=javascript:alert(1)'] loop
    begin
      perform apply_hackathon(jsonb_build_object('skills', jsonb_build_array(v_skill),
                split_part(v_bad, '=', 1), substr(v_bad, strpos(v_bad, '=') + 1)));
      v_s := v_s || ' ALLOWED (BUG): ' || v_bad;
    exception when others then
      get stacked diagnostics v_detail = pg_exception_detail;
      if not (sqlstate = '22023' and sqlerrm = 'invalid_url' and v_detail = split_part(v_bad, '=', 1)) then
        v_s := v_s || ' ' || sqlstate || '/' || coalesce(v_detail, '') || ' bei ' || v_bad;
      end if;
    end;
  end loop;
  insert into t_res values ('02_ungueltig', case when v_s = '' then 'ok' else v_s end);

  -- 03 + 04
  perform apply_hackathon(jsonb_build_object('skills', jsonb_build_array(v_skill), 'motivation', 'Ich will bauen'));
  v_j := my_hack()->'application';
  insert into t_res values ('03_leeren', case when v_j->>'github_url' is null and v_j->>'behance_url' is null then 'ok' else v_j::text end);
  insert into t_res values ('04_nebenspalten', case when v_j->>'motivation' = 'Ich will bauen' and v_j->'skills' ? v_skill then 'ok' else v_j::text end);

  -- 05
  perform apply_hackathon(jsonb_build_object('skills', jsonb_build_array(v_skill), 'github_url', 'https://github.com/test'));
  perform set_config('request.jwt.claims', null, true);
  perform anonymize_person(v_pid);
  insert into t_res values ('05_anonymize',
    case when (select github_url is null and website_url is null and behance_url is null from hack_application where person_id = v_pid)
         then 'ok' else 'FEHLER' end);

  -- 06
  insert into t_res values ('06_nicht_im_profil',
    case when not exists (select 1 from information_schema.columns where table_name = 'person'
                           and column_name ~ '(github|behance|portfolio|website)') then 'ok' else 'FEHLER' end);
end $$;
select * from t_res order by step;
rollback;

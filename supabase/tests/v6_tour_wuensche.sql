-- Smoke-Test (Company Tour: bis zu fünf Wünsche je Stopp, PART-092). Nummer offen.
-- Wegwerf-Organisationen, -Tour, -Session und -Bewerbende, echte Partnerrolle des angemeldeten Kontos,
-- alles zurückgerollt. Belegt:
--   01 fünf Wünsche gehen, der sechste nicht (P0001 `too_many_wishes`), die Zahl bleibt 5;
--   02 derselbe Wunsch zweimal ändert nichts;
--   03 zurücknehmen gibt einen Platz frei, danach geht der sechste;
--   04 eine Bewerbung ohne Einwilligung: P0001 `application_not_shared`;
--   05 eine Bewerbung einer anderen Session: P0002 `application_not_found`;
--   06 Stopp einer fremden Organisation 42501;
--   07 `partner_tour_applications` kennzeichnet genau die gewünschten Zeilen;
--   08 `tour_wishes_for_session`: Partner 42501, Team sieht die fünf Wünsche mit Organisation und Stopp;
--   09 die Tabelle: RLS an, keine Rechte für `authenticated`/`anon`; jeder Wunsch im Audit;
--   10 SECURITY DEFINER mit festem search_path, `authenticated` darf, `anon` nicht.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_ev uuid;
  v_org uuid; v_fremd uuid; v_se uuid; v_se2 uuid; v_tour uuid; v_stopp uuid; v_stopp_fremd uuid;
  v_apps uuid[] := '{}'; v_ohne uuid; v_andere uuid; v_p uuid; v_a uuid; v_n integer; v_txt text; i integer;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null limit 1;
  if v_pid is null then raise exception 'VORBEDINGUNG: keine Person mit Konto'; end if;
  delete from role_assignment where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select e.id into v_ev from event e where e.edition_id = v_ed and e.format_tag = 'summit' order by e.start_date limit 1;
  if v_ev is null then raise exception 'VORBEDINGUNG: Summit fehlt'; end if;

  insert into organization (legal_name) values ('ZZ Wunsch GmbH') returning id into v_org;
  insert into organization (legal_name) values ('ZZ Fremder Wunsch GmbH') returning id into v_fremd;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited'), (v_fremd, v_ed, 'invited');
  insert into org_membership (person_id, org_id, roles) values (v_pid, v_org, '{additional}');
  insert into role_assignment (person_id, role, scope_type, scope_id) values (v_pid, 'partner_contact', 'org', v_org);
  insert into session (event_id, format, title_de, access_mode, publish_status, tags)
    values (v_ev, 'company_tour', 'ZZ Wunsch-Tour', 'application', 'draft', '{}') returning id into v_se;
  insert into session (event_id, format, title_de, access_mode, publish_status, tags)
    values (v_ev, 'masterclass', 'ZZ Andere', 'application', 'draft', '{}') returning id into v_se2;
  insert into company_tour (edition_id, name, session_id) values (v_ed, 'ZZ Wunsch-Tour', v_se) returning id into v_tour;
  insert into company_tour_stop (tour_id, sort_order, host_org_id, target_profile) values (v_tour, 1, v_org, '{}') returning id into v_stopp;
  insert into company_tour_stop (tour_id, sort_order, host_org_id, target_profile) values (v_tour, 2, v_fremd, '{}') returning id into v_stopp_fremd;
  for i in 1..6 loop
    insert into person (first_name, last_name) values ('ZZ', 'Bewerbung ' || i) returning id into v_p;
    insert into application (session_id, person_id, consent_share, status) values (v_se, v_p, true, 'shortlisted') returning id into v_a;
    v_apps := v_apps || v_a;
  end loop;
  insert into person (first_name, last_name) values ('ZZ', 'Ohne Einwilligung') returning id into v_p;
  insert into application (session_id, person_id, consent_share, status) values (v_se, v_p, false, 'shortlisted') returning id into v_ohne;
  insert into person (first_name, last_name) values ('ZZ', 'Andere Session') returning id into v_p;
  insert into application (session_id, person_id, consent_share, status) values (v_se2, v_p, true, 'shortlisted') returning id into v_andere;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  if not partner_can_edit(v_org) then raise exception 'VORBEDINGUNG: Konto darf die Organisation nicht bearbeiten'; end if;

  -- 01 Fünf gehen, der sechste nicht
  for i in 1..5 loop
    v_n := partner_set_tour_wish(v_stopp, v_apps[i], true);
  end loop;
  begin
    perform partner_set_tour_wish(v_stopp, v_apps[6], true);
    insert into t_res values ('01_obergrenze', 'ALLOWED (BUG): sechster Wunsch');
  exception
    when sqlstate 'P0001' then
      insert into t_res values ('01_obergrenze',
        case when sqlerrm = 'too_many_wishes' and v_n = 5
                  and (select count(*) from company_tour_wish where stop_id = v_stopp) = 5
             then 'fünf gehen, der sechste nicht (richtig)' else 'P0001 ' || sqlerrm || ', Zahl ' || v_n end);
    when others then insert into t_res values ('01_obergrenze', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 02 Zweimal derselbe
  v_n := partner_set_tour_wish(v_stopp, v_apps[1], true);
  insert into t_res values ('02_zweimal', case when v_n = 5 then 'ändert nichts (richtig)' else 'unerwartet: ' || v_n end);

  -- 03 Zurücknehmen und nachrücken
  v_n := partner_set_tour_wish(v_stopp, v_apps[2], false);
  v_txt := v_n::text;
  v_n := partner_set_tour_wish(v_stopp, v_apps[6], true);
  insert into t_res values ('03_nachruecken',
    case when v_txt = '4' and v_n = 5 then 'Rücknahme gibt Platz frei, sechster rückt nach (richtig)' else 'unerwartet: ' || v_txt || ' / ' || v_n end);

  -- 04 Ohne Einwilligung
  begin
    perform partner_set_tour_wish(v_stopp, v_ohne, true);
    insert into t_res values ('04_ohne_einwilligung', 'ALLOWED (BUG)');
  exception
    when sqlstate 'P0001' then insert into t_res values ('04_ohne_einwilligung',
      case when sqlerrm = 'application_not_shared' then 'application_not_shared (richtig)' else 'P0001 ' || sqlerrm end);
    when others then insert into t_res values ('04_ohne_einwilligung', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 05 Andere Session
  begin
    perform partner_set_tour_wish(v_stopp, v_andere, true);
    insert into t_res values ('05_andere_session', 'ALLOWED (BUG)');
  exception
    when sqlstate 'P0002' then insert into t_res values ('05_andere_session',
      case when sqlerrm = 'application_not_found' then 'application_not_found (richtig)' else 'P0002 ' || sqlerrm end);
    when others then insert into t_res values ('05_andere_session', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 06 Fremder Stopp
  begin
    perform partner_set_tour_wish(v_stopp_fremd, v_apps[3], true);
    insert into t_res values ('06_fremder_stopp', 'ALLOWED (BUG)');
  exception
    when sqlstate '42501' then insert into t_res values ('06_fremder_stopp', '42501 (richtig)');
    when others then insert into t_res values ('06_fremder_stopp', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 07 Kennzeichnung in der Liste
  select count(*) filter (where x.wished)::integer, string_agg(case when x.wished then x.id::text end, ',')
    into v_n, v_txt from partner_tour_applications(v_stopp) x;
  insert into t_res values ('07_liste',
    case when v_n = 5 and v_txt not like '%' || v_apps[2]::text || '%' and v_txt like '%' || v_apps[6]::text || '%'
         then 'genau die fünf gewünschten gekennzeichnet (richtig)' else 'unerwartet: ' || coalesce(v_n::text, 'null') end);

  -- 08 Team-Sicht
  begin
    perform * from tour_wishes_for_session(v_se);
    insert into t_res values ('08a_partner_teamsicht', 'ALLOWED (BUG): Partner liest die Team-Sicht');
  exception
    when sqlstate '42501' then insert into t_res values ('08a_partner_teamsicht', '42501 (richtig)');
    when others then insert into t_res values ('08a_partner_teamsicht', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  select count(*)::integer, min(x.org_name) || ' / ' || min(x.stop_sort)::text into v_n, v_txt from tour_wishes_for_session(v_se) x;
  insert into t_res values ('08b_team_sicht',
    case when v_n = 5 and v_txt = 'ZZ Wunsch GmbH / 1' then 'Team sieht fünf Wünsche mit Organisation und Stopp (richtig)'
         else 'unerwartet: ' || v_n || ' / ' || coalesce(v_txt, 'null') end);
  delete from role_assignment where person_id = v_pid and role = 'admin';

  -- 09 Audit
  select count(*)::integer into v_n from audit_log
   where object_id = v_stopp::text and action in ('partner.tour_wish', 'partner.tour_wish_remove');
  insert into t_res values ('09b_audit', case when v_n >= 7 then 'jeder Wunsch und jede Rücknahme im Audit (richtig)' else 'BUG: nur ' || v_n end);
end $$;

insert into t_res
select '09a_tabelle',
       case when not c.relrowsecurity then 'BUG: RLS aus'
            when has_table_privilege('authenticated', 'company_tour_wish', 'select')
              or has_table_privilege('authenticated', 'company_tour_wish', 'insert')
              or has_table_privilege('anon', 'company_tour_wish', 'select')
              then 'ALLOWED (BUG): Tabelle direkt erreichbar'
            else 'RLS an, keine Rechte für authenticated/anon (richtig)' end
  from pg_class c where c.oid = 'company_tour_wish'::regclass;

insert into t_res
select '10_funktionen',
       case when bool_or(not p.prosecdef) then 'BUG: nicht SECURITY DEFINER'
            when bool_or(not coalesce(p.proconfig::text like '%search_path=public, extensions%', false)) then 'BUG: search_path nicht fest'
            when bool_or(not has_function_privilege('authenticated', p.oid, 'execute')) then 'BUG: authenticated darf nicht'
            when bool_or(has_function_privilege('anon', p.oid, 'execute')) then 'ALLOWED (BUG): anon'
            else 'drei Funktionen: SECURITY DEFINER, search_path fest, authenticated ja, anon nein (richtig)' end
  from pg_proc p
 where p.oid in ('partner_set_tour_wish(uuid, uuid, boolean)'::regprocedure,
                 'partner_tour_applications(uuid)'::regprocedure,
                 'tour_wishes_for_session(uuid)'::regprocedure);

select * from t_res order by step;
rollback;

-- Smoke-Test (Company Tour: Export der Bewerbungen für den Partner eines Stopps, PART-051). Nummer offen.
-- Wegwerf-Organisationen, -Tour, -Session und -Bewerbende, echte Partnerrolle des angemeldeten Kontos,
-- alles zurückgerollt. Belegt:
--   01 der Partner des Stopps exportiert nur Bewerbungen mit Einwilligung — mit Name, E-Mail, Profil und
--      Antworten mit Fragetext; die Bewerbung ohne Einwilligung und die einer anderen Session fehlen;
--   01b `wunsch` zeigt genau den Wunsch dieses Stopps (PART-092), nicht den eines anderen Stopps;
--   02 jeder Export steht im Audit (`partner.application_export`, `tour`, Zeilenzahl, Stopp);
--   03 Stopp einer fremden Organisation 42501, Stopp ohne Organisation 42501, unbekannter Stopp P0002;
--   04 Tour ohne verknüpfte Session: keine Zeilen, kein Fehler;
--   05 SECURITY DEFINER, fester search_path, `authenticated` darf, `anon` nicht.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_ev uuid;
  v_org uuid; v_fremd uuid; v_se uuid; v_se2 uuid; v_tour uuid; v_tour2 uuid;
  v_stopp uuid; v_stopp_fremd uuid; v_stopp_ohne uuid; v_stopp_leer uuid;
  v_frage uuid; v_p1 uuid; v_p2 uuid; v_p3 uuid; v_p4 uuid; v_a1 uuid; v_a4 uuid; v_r record; v_n integer;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null limit 1;
  if v_pid is null then raise exception 'VORBEDINGUNG: keine Person mit Konto'; end if;
  delete from role_assignment where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select e.id into v_ev from event e where e.edition_id = v_ed and e.format_tag = 'summit' order by e.start_date limit 1;
  if v_ev is null then raise exception 'VORBEDINGUNG: Summit fehlt'; end if;

  insert into organization (legal_name) values ('ZZ Export GmbH') returning id into v_org;
  insert into organization (legal_name) values ('ZZ Fremder Export GmbH') returning id into v_fremd;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited'), (v_fremd, v_ed, 'invited');
  insert into org_membership (person_id, org_id, roles) values (v_pid, v_org, '{additional}');
  insert into role_assignment (person_id, role, scope_type, scope_id) values (v_pid, 'partner_contact', 'org', v_org);
  insert into session (event_id, format, title_de, access_mode, publish_status, tags)
    values (v_ev, 'company_tour', 'ZZ Export-Tour', 'application', 'draft', '{}') returning id into v_se;
  insert into session (event_id, format, title_de, access_mode, publish_status, tags)
    values (v_ev, 'masterclass', 'ZZ Andere', 'application', 'draft', '{}') returning id into v_se2;
  insert into company_tour (edition_id, name, session_id) values (v_ed, 'ZZ Export-Tour', v_se) returning id into v_tour;
  insert into company_tour (edition_id, name) values (v_ed, 'ZZ Tour ohne Session') returning id into v_tour2;
  insert into company_tour_stop (tour_id, sort_order, host_org_id, target_profile) values (v_tour, 1, v_org, '{}') returning id into v_stopp;
  insert into company_tour_stop (tour_id, sort_order, host_org_id, target_profile) values (v_tour, 2, v_fremd, '{}') returning id into v_stopp_fremd;
  insert into company_tour_stop (tour_id, sort_order, target_profile) values (v_tour, 3, '{}') returning id into v_stopp_ohne;
  insert into company_tour_stop (tour_id, sort_order, host_org_id, target_profile) values (v_tour2, 1, v_org, '{}') returning id into v_stopp_leer;
  insert into session_question (session_id, label_de, label_en, type, required, sort_order, purpose)
    values (v_se, 'ZZ Warum diese Tour?', 'ZZ Why this tour?', 'textarea', false, 1, 'Auswahl') returning id into v_frage;

  insert into person (first_name, last_name, city) values ('ZZ', 'Eins', 'Hamburg') returning id into v_p1;
  insert into person_email (person_id, email, is_primary) values (v_p1, 'zz-export-eins@example.org', true);
  insert into person (first_name, last_name) values ('ZZ', 'Zwei') returning id into v_p2;
  insert into person (first_name, last_name) values ('ZZ', 'Drei') returning id into v_p3;
  insert into person (first_name, last_name) values ('ZZ', 'Vier') returning id into v_p4;
  -- Status `shortlisted`: `applied` löste über trg_application_mail eine Mail aus.
  insert into application (session_id, person_id, answers, consent_share, status)
    values (v_se, v_p1, jsonb_build_object(v_frage::text, 'Weil ich Logistik mag'), true, 'shortlisted')
    returning id into v_a1;
  insert into application (session_id, person_id, answers, consent_share, status)
    values (v_se, v_p4, '{}'::jsonb, true, 'shortlisted') returning id into v_a4;
  insert into application (session_id, person_id, answers, consent_share, status)
    values (v_se, v_p2, jsonb_build_object(v_frage::text, 'Geheim'), false, 'shortlisted'),
           (v_se2, v_p3, '{}'::jsonb, true, 'shortlisted');
  -- Wunsch dieses Stopps an Eins, Wunsch des fremden Stopps an Vier.
  insert into company_tour_wish (stop_id, application_id, created_by)
    values (v_stopp, v_a1, v_pid), (v_stopp_fremd, v_a4, v_pid);

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  if not partner_can_edit(v_org) then raise exception 'VORBEDINGUNG: Konto darf die Organisation nicht bearbeiten'; end if;

  -- 01 Nur mit Einwilligung
  select count(*)::integer into v_n from export_tour_applications(v_stopp);
  select * into v_r from export_tour_applications(v_stopp) x where x.bewerbung_id = v_a1;
  insert into t_res values ('01_export',
    case when v_n = 2 and v_r.name = 'ZZ Eins' and v_r.email = 'zz-export-eins@example.org' and v_r.stadt = 'Hamburg'
              and v_r.antworten->0->>'label_de' = 'ZZ Warum diese Tour?' and v_r.antworten->0->>'value' = 'Weil ich Logistik mag'
              and not exists (select 1 from export_tour_applications(v_stopp) x where x.name in ('ZZ Zwei', 'ZZ Drei'))
         then 'zwei Zeilen mit Einwilligung, Name, E-Mail, Profil, Fragetext; ohne Einwilligung und fremde Session fehlen (richtig)'
         else 'unerwartet: ' || v_n || ' Zeilen, ' || coalesce(v_r.name, 'null') || ', ' || coalesce(v_r.antworten::text, 'null') end);

  -- 01b Wunsch nur dieses Stopps
  select count(*)::integer into v_n from export_tour_applications(v_stopp) x
   where (x.bewerbung_id = v_a1 and x.wunsch) or (x.bewerbung_id = v_a4 and not x.wunsch);
  insert into t_res values ('01b_wunsch',
    case when v_n = 2 then 'Wunsch dieses Stopps ja, Wunsch des fremden Stopps nein (richtig)'
         else 'BUG: ' || v_n || ' von 2 Zeilen mit richtigem Wunsch' end);

  -- 02 Audit
  select count(*)::integer into v_n from audit_log
   where action = 'partner.application_export' and object_id = v_se::text
     and after->>'tour' = 'true' and (after->>'rows')::integer = 2 and after->>'stop_id' = v_stopp::text;
  insert into t_res values ('02_audit', case when v_n >= 1 then 'Export im Audit (richtig)' else 'BUG: kein Audit' end);

  -- 03 Fremd, ohne Organisation, unbekannt
  begin
    perform * from export_tour_applications(v_stopp_fremd);
    insert into t_res values ('03a_fremder_stopp', 'ALLOWED (BUG)');
  exception
    when sqlstate '42501' then insert into t_res values ('03a_fremder_stopp', '42501 (richtig)');
    when others then insert into t_res values ('03a_fremder_stopp', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;
  begin
    perform * from export_tour_applications(v_stopp_ohne);
    insert into t_res values ('03b_ohne_org', 'ALLOWED (BUG)');
  exception
    when sqlstate '42501' then insert into t_res values ('03b_ohne_org', '42501 (richtig)');
    when others then insert into t_res values ('03b_ohne_org', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;
  begin
    perform * from export_tour_applications(gen_random_uuid());
    insert into t_res values ('03c_unbekannt', 'ALLOWED (BUG)');
  exception
    when sqlstate 'P0002' then insert into t_res values ('03c_unbekannt',
      case when sqlerrm = 'stop_not_found' then 'stop_not_found (richtig)' else 'P0002 ' || sqlerrm end);
    when others then insert into t_res values ('03c_unbekannt', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 04 Tour ohne Session
  begin
    select count(*)::integer into v_n from export_tour_applications(v_stopp_leer);
    insert into t_res values ('04_ohne_session', case when v_n = 0 then 'keine Zeilen, kein Fehler (richtig)' else 'unerwartet: ' || v_n end);
  exception when others then
    insert into t_res values ('04_ohne_session', 'BUG: ' || sqlstate || ' ' || sqlerrm);
  end;
end $$;

insert into t_res
select '05_rechte',
       case when not p.prosecdef then 'BUG: nicht SECURITY DEFINER'
            when not coalesce(p.proconfig::text like '%search_path=public, extensions%', false) then 'BUG: search_path nicht fest'
            when not has_function_privilege('authenticated', p.oid, 'execute') then 'BUG: authenticated darf nicht'
            when has_function_privilege('anon', p.oid, 'execute') then 'ALLOWED (BUG): anon'
            else 'SECURITY DEFINER, search_path fest, authenticated ja, anon nein (richtig)' end
  from pg_proc p
 where p.oid = 'export_tour_applications(uuid)'::regprocedure;

select * from t_res order by step;
rollback;

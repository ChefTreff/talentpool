-- Smoke-Test (Masterclass: Katalogfragen wählen, ohne die Fragen des Teams zu verlieren, PART-045).
-- Nummer offen. Wegwerf-Organisation, -Session und -Katalogfragen, echte Partnerrolle des angemeldeten
-- Kontos, alles zurückgerollt. Belegt:
--   01 der Partner wählt zwei wählbare Katalogfragen: die Frage des Teams (nicht wählbar, Pflicht) bleibt,
--      eine schon gesetzte wählbare Frage behält ihre Pflicht-Markierung und ihren Platz, die neue kommt
--      hinten an; eine eigene (beantragte) Frage bleibt;
--   02 eine leere Auswahl nimmt nur die wählbaren Fragen weg — Teamfrage und eigene Frage bleiben;
--   03 eine nicht wählbare Frage in der Auswahl: P0001 `question_not_selectable`, nichts geändert;
--   04 Session einer fremden Organisation 42501;
--   05 SECURITY DEFINER, fester search_path, `authenticated` darf, `anon` nicht.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_ev uuid;
  v_org uuid; v_fremd uuid; v_se uuid; v_se_fremd uuid;
  v_team uuid; v_a uuid; v_b uuid; v_txt text; v_n integer;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null limit 1;
  if v_pid is null then raise exception 'VORBEDINGUNG: keine Person mit Konto'; end if;
  delete from role_assignment where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select e.id into v_ev from event e where e.edition_id = v_ed and e.format_tag = 'summit' order by e.start_date limit 1;
  if v_ev is null then raise exception 'VORBEDINGUNG: Summit fehlt'; end if;

  insert into organization (legal_name) values ('ZZ Masterclass GmbH') returning id into v_org;
  insert into organization (legal_name) values ('ZZ Fremde Masterclass GmbH') returning id into v_fremd;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited'), (v_fremd, v_ed, 'invited');
  insert into org_membership (person_id, org_id, roles) values (v_pid, v_org, '{additional}');
  insert into role_assignment (person_id, role, scope_type, scope_id) values (v_pid, 'partner_contact', 'org', v_org);
  insert into session (event_id, format, title_de, partner_org_id, host_org_id, access_mode, publish_status, tags)
    values (v_ev, 'masterclass', 'ZZ Masterclass', v_org, v_org, 'application', 'draft', '{}') returning id into v_se;
  insert into session (event_id, format, title_de, partner_org_id, host_org_id, access_mode, publish_status, tags)
    values (v_ev, 'masterclass', 'ZZ Fremde Masterclass', v_fremd, v_fremd, 'application', 'draft', '{}') returning id into v_se_fremd;

  insert into question_catalog (key, label_de, label_en, type, active, sort_order, partner_selectable)
    values ('zz_team', 'ZZ Teamfrage', 'ZZ Team question', 'textarea', true, 900, false) returning id into v_team;
  insert into question_catalog (key, label_de, label_en, type, active, sort_order, partner_selectable)
    values ('zz_a', 'ZZ Frage A', 'ZZ Question A', 'text', true, 901, true) returning id into v_a;
  insert into question_catalog (key, label_de, label_en, type, active, sort_order, partner_selectable)
    values ('zz_b', 'ZZ Frage B', 'ZZ Question B', 'text', true, 902, true) returning id into v_b;
  -- Das Team hat seine Frage und Frage A gesetzt, beide als Pflicht; dazu eine eigene Frage des Partners.
  insert into session_question (session_id, question_id, required, sort_order) values (v_se, v_team, true, 1), (v_se, v_a, true, 2);
  insert into session_question (session_id, label_de, type, required, sort_order, purpose, requested_by)
    values (v_se, 'ZZ Eigene Frage', 'text', false, 90, 'Auswahl', v_pid);

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  if not partner_can_edit(v_org) then raise exception 'VORBEDINGUNG: Konto darf die Organisation nicht bearbeiten'; end if;

  -- 01 A und B wählen
  perform partner_set_session_questions(v_se, array[v_a, v_b]);
  select string_agg(coalesce(qc.key, 'eigen') || ':' || sq.required::text || ':' || sq.sort_order::text, ',' order by sq.sort_order)
    into v_txt from session_question sq left join question_catalog qc on qc.id = sq.question_id where sq.session_id = v_se;
  insert into t_res values ('01_waehlen',
    case when v_txt = 'zz_team:true:1,zz_a:true:2,zz_b:false:3,eigen:false:90'
         then 'Teamfrage bleibt, A behält Pflicht und Platz, B hinten, eigene bleibt (richtig)'
         else 'unerwartet: ' || coalesce(v_txt, 'leer') end);

  -- 02 Leere Auswahl
  perform partner_set_session_questions(v_se, '{}'::uuid[]);
  select string_agg(coalesce(qc.key, 'eigen'), ',' order by sq.sort_order)
    into v_txt from session_question sq left join question_catalog qc on qc.id = sq.question_id where sq.session_id = v_se;
  insert into t_res values ('02_leer',
    case when v_txt = 'zz_team,eigen' then 'nur die wählbaren weg, Teamfrage und eigene bleiben (richtig)'
         else 'unerwartet: ' || coalesce(v_txt, 'leer') end);

  -- 03 Nicht wählbare Frage in der Auswahl
  begin
    perform partner_set_session_questions(v_se, array[v_a, v_team]);
    insert into t_res values ('03_nicht_waehlbar', 'ALLOWED (BUG): Teamfrage gewählt');
  exception
    when sqlstate 'P0001' then
      select count(*)::integer into v_n from session_question where session_id = v_se;
      insert into t_res values ('03_nicht_waehlbar',
        case when sqlerrm = 'question_not_selectable' and v_n = 2 then 'question_not_selectable, nichts geändert (richtig)'
             else 'P0001 ' || sqlerrm || ', Zeilen ' || v_n end);
    when others then insert into t_res values ('03_nicht_waehlbar', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 04 Fremde Session
  begin
    perform partner_set_session_questions(v_se_fremd, array[v_a]);
    insert into t_res values ('04_fremd', 'ALLOWED (BUG)');
  exception
    when sqlstate '42501' then insert into t_res values ('04_fremd', '42501 (richtig)');
    when others then insert into t_res values ('04_fremd', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
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
 where p.oid = 'partner_set_session_questions(uuid, uuid[])'::regprocedure;

select * from t_res order by step;
rollback;

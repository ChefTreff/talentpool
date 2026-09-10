-- Smoke-Test 0047: Bewerber-Auswahl für Partner-Formate — Session mit host_org_id, partner_sessions mit Zählern, partner_applications nur für aktive
-- primary_ops/additional/signing (event_app_member 42501, abgelaufene Rolle 42501, fremde Org 42501), Consent-Filter wie im Team-RPC, Audit je Abruf,
-- Entscheidung über decide_application, release_decisions bleibt Team, my_partner_stages über stage.partner_org_id.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_org uuid; v_org2 uuid; v_oe uuid; v_event uuid; v_session uuid; v_session2 uuid; v_app1 uuid; v_app2 uuid;
        v_t1 uuid; v_t2 uuid; v_p_app uuid; v_stage uuid; v_stage_type text; v_json jsonb;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid; delete from staff_user where auth_user_id = v_uid; -- Testperson ohne Vorrechte (Rollback stellt alles wieder her)
  select id into v_ed from event where is_edition and slug = 'fls27';
  select e.id into v_event from event e where e.edition_id = v_ed and not e.is_edition and exists (select 1 from stage s where s.event_id = e.id) limit 1;
  -- Team legt zwei Partner-Orgs, eine Masterclass je Org und zwei Bewerbungen an
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  insert into organization (legal_name, communication_name, type) values ('Host GmbH', 'Host', 'corporate') returning id into v_org;
  insert into organization (legal_name, communication_name, type) values ('Fremd GmbH', 'Fremd', 'corporate') returning id into v_org2;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited') returning id into v_oe;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org2, v_ed, 'invited');
  perform upsert_partner_contact(v_org, v_email, 'Test', 'Person', '{primary_ops}');
  v_p_app := upsert_partner_contact(v_org, 'app.host@example.com', 'App', 'Member', '{event_app_member}');
  delete from role_assignment where person_id = v_pid and role = 'area_lead_partner';
  perform set_config('request.jwt.claims', '', true);
  insert into session (event_id, format, title_de, access_mode, capacity, host_org_id, publish_status)
  values (v_event, 'masterclass', 'Masterclass Host', 'application', 10, v_org, 'draft') returning id into v_session;
  insert into session (event_id, format, title_de, access_mode, capacity, host_org_id, publish_status)
  values (v_event, 'company_tour', 'Tour Fremd', 'application', 10, v_org2, 'draft') returning id into v_session2;
  insert into person (first_name, last_name, source_first, tier, university, career_level) values ('Talent', 'Eins', 'portal', 'talent', 'Uni Hamburg', 'student') returning id into v_t1;
  insert into person_email (person_id, email, is_primary, verified) values (v_t1, 't1.app@example.com', true, true);
  insert into person (first_name, last_name, source_first, tier) values ('Talent', 'Zwei', 'portal', 'talent') returning id into v_t2;
  insert into person_email (person_id, email, is_primary, verified) values (v_t2, 't2.app@example.com', true, true);
  insert into application (session_id, person_id, status, answers, consent_share) values (v_session, v_t1, 'applied', '{"motivation": "Ja"}'::jsonb, true) returning id into v_app1;
  insert into application (session_id, person_id, status, answers, consent_share) values (v_session, v_t2, 'applied', '{"motivation": "Nein"}'::jsonb, false) returning id into v_app2;
  -- Partner-Sicht (primary_ops der Host-Org)
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  insert into t_res values ('01_can_decide', 'own=' || can_decide_session(v_session)::text || ' foreign=' || can_decide_session(v_session2)::text);
  insert into t_res values ('02_partner_sessions', (select count(*)::text || ' title=' || max(title_de) || ' total=' || max(counts->>'total') || ' applied=' || max(counts->>'applied') || ' released=' || max(released::text) from partner_sessions(v_org)));
  begin
    perform partner_sessions(v_org2);
    insert into t_res values ('03_foreign_sessions', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('03_foreign_sessions', 'rejected ' || sqlstate); end;
  insert into t_res values ('04_partner_applications', (select count(*)::text || ' names=' || string_agg(coalesce(display_name, '(verborgen)'), ',' order by created_at)
                                                               || ' answers_visible=' || count(*) filter (where answers is not null)::text || ' profile_uni=' || max(profile->>'university') from partner_applications(v_session)));
  insert into t_res values ('05_audit_view', (select count(*)::text || ' org_ok=' || max((after->>'org_id' = v_org::text)::text) || ' rows=' || max(after->>'rows') || ' team=' || max(after->>'team')
                                               from audit_log where action = 'application.partner_view' and object_id = v_session::text));
  begin
    perform partner_applications(v_session2);
    insert into t_res values ('06_foreign_applications', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('06_foreign_applications', 'rejected ' || sqlstate); end;
  perform decide_application(v_app1, 'accepted', 1);
  perform decide_application(v_app2, 'waitlisted');
  insert into t_res values ('07_decided', (select string_agg(status || ':' || coalesce(rank::text, '-'), ',' order by created_at) from application where session_id = v_session)
                                          || ' decision_mails=' || (select count(*)::text from mail_log where related_id in (v_app1, v_app2) and template_key <> 'application_received')); -- Eingangsbestätigung ja, Entscheidung erst nach Freigabe
  begin
    perform release_decisions(v_session, null);
    insert into t_res values ('08_partner_release', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('08_partner_release', 'rejected ' || sqlstate); end;
  -- event_app_member der Host-Org: keine Bewerberdaten
  perform set_config('request.jwt.claims', '', true);
  update person set auth_user_id = null where id = v_p_app; -- App-Mitglied hat noch kein Login; Sicht über Rollenfunktion prüfen
  insert into t_res values ('09_app_member_cannot_decide', (select (not (partner_roles(v_org) && '{primary_ops,additional,signing}'::text[]))::text from (select 1) s)
                                                            || ' roles=' || (select roles::text from org_membership where org_id = v_org and person_id = v_p_app));
  -- abgelaufene Rolle der Testperson ⇒ kein Zugriff mehr, Mitgliedschaft bleibt
  update role_assignment set valid_from = now() - interval '2 hours', valid_to = now() - interval '1 hour' where person_id = v_pid and role = 'partner_contact' and scope_id = v_org; -- Rolle abgelaufen
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  begin
    perform partner_applications(v_session);
    insert into t_res values ('10_expired_role', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('10_expired_role', 'rejected ' || sqlstate || ' member_still=' || (select count(*)::text from org_membership where org_id = v_org and person_id = v_pid)); end;
  update role_assignment set valid_to = null where person_id = v_pid and role = 'partner_contact' and scope_id = v_org;
  -- Standbühne: Rolle standbuehne_editor Scope org + Bühne mit partner_org_id ⇒ my_partner_stages
  insert into t_res values ('11_stages_without_role', (select count(*)::text from my_partner_stages()));
  perform set_config('request.jwt.claims', '', true);
  insert into role_assignment (person_id, role, scope_type, scope_id, edition_id) values (v_pid, 'standbuehne_editor', 'org', v_org, v_ed);
  select s.type into v_stage_type from stage s where s.event_id = v_event limit 1;
  insert into stage (event_id, name, slug, type, sort_order, active, partner_org_id) values (v_event, 'Standbühne Host', 'standbuehne-host-test', v_stage_type, 98, true, v_org) returning id into v_stage;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  insert into t_res values ('12_stages_with_role', (select count(*)::text || ' name=' || max(stage_name) || ' org=' || max(org_name) || ' editable=' || max(can_edit_stage(stage_id)::text) from my_partner_stages()));
  insert into t_res values ('13_grants', 'partner_applications_volatile=' || (select (provolatile = 'v')::text from pg_proc where proname = 'partner_applications')
                                          || ' sessions_stable=' || (select (provolatile = 's')::text from pg_proc where proname = 'partner_sessions'));
  insert into t_res values ('14_audit', (select string_agg(action || '=' || n::text, ', ' order by action) from (select action, count(*) n from audit_log where action like 'application.%' and created_at >= now() group by action) s));
end $$;
select * from t_res order by step;
rollback;

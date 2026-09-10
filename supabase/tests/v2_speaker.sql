-- Smoke-Test 0025: Speaker-Datenmodell, Scope-Rechte, Assistenz-Grenzen, Einladung, Pipeline, Reisekosten-Freigabe.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_sp uuid; v_sp2 uuid; v_other uuid; v_aid uuid; v_json jsonb; v_mail bigint;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary where p.auth_user_id is not null limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  delete from role_assignment where person_id = v_pid; delete from staff_user where auth_user_id = v_uid; -- Testperson ohne Vorrechte (Rollback stellt alles wieder her)
  select id into v_ed from event where is_edition order by created_at limit 1;

  -- 01 ohne Rolle
  begin
    perform upsert_speaker(jsonb_build_object('edition_id', v_ed, 'email', 'speaker-' || gen_random_uuid()::text || '@example.com', 'first_name', 'Sam', 'last_name', 'Speaker'));
    insert into t_res values ('01_upsert_without_role', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('01_upsert_without_role', 'rejected ' || sqlstate); end;

  -- Manager (Edition) legt Speaker an
  insert into role_assignment (person_id, role, scope_type, edition_id) values (v_pid, 'speaker_manager', 'edition', v_ed);
  v_sp := upsert_speaker(jsonb_build_object('edition_id', v_ed, 'email', 'Sam.Speaker@Example.com', 'first_name', 'Sam', 'last_name', 'Speaker',
                                            'speaker_type', 'masterclass_host', 'job_title', 'CTO', 'organization_name', 'ACME'));
  insert into t_res values ('02_upsert_ok', (v_sp is not null)::text);
  insert into t_res values ('03_pass_rule_masterclass', (select pass_type || ' lounge=' || lounge_access::text from speaker_profile where id = v_sp));
  insert into t_res values ('04_role_speaker_edition', (select count(*)::text from role_assignment ra join speaker_profile sp on sp.person_id = ra.person_id where sp.id = v_sp and ra.role = 'speaker' and ra.scope_type = 'edition' and ra.edition_id = v_ed));
  perform upsert_speaker(jsonb_build_object('edition_id', v_ed, 'email', 'sam.speaker@example.com', 'job_title', 'CEO')); -- gleiche Person, andere Schreibweise
  insert into t_res values ('05_upsert_idempotent_same_email_case', (select (count(*) = 1)::text || ' job=' || max(job_title) from speaker_profile where person_id = (select person_id from speaker_profile where id = v_sp) and edition_id = v_ed));
  begin
    perform upsert_speaker(jsonb_build_object('edition_id', v_ed, 'email', 'sam.speaker@example.com', 'hotel_tier', 'vip'));
    insert into t_res values ('06_team_only_field_as_manager', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('06_team_only_field_as_manager', 'rejected ' || sqlstate); end;
  begin
    perform upsert_speaker(jsonb_build_object('edition_id', v_ed, 'email', 'x-' || gen_random_uuid()::text || '@example.com', 'speaker_type', 'unbekannt'));
    insert into t_res values ('07_invalid_speaker_type', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('07_invalid_speaker_type', 'rejected ' || sqlstate); end;

  -- Suppression: gesperrte Adresse darf nicht angelegt werden
  insert into suppression (email_hash, reason) values (email_hash('gesperrt@example.com'), 'test');
  begin
    perform upsert_speaker(jsonb_build_object('edition_id', v_ed, 'email', 'gesperrt@example.com'));
    insert into t_res values ('08_suppressed_blocked', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('08_suppressed_blocked', 'rejected ' || sqlerrm); end;

  -- Einladung erst ab confirmed
  begin
    perform invite_speaker(v_sp);
    insert into t_res values ('09_invite_before_confirmed', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('09_invite_before_confirmed', 'rejected ' || sqlerrm); end;
  perform set_speaker_pipeline(v_sp, 'confirmed');
  v_mail := invite_speaker(v_sp);
  insert into t_res values ('10_invite_queued', (select template_key || ' ' || status || ' locale=' || locale || ' vars=' || (meta->'vars'->>'edition_name') from mail_log where id = v_mail));
  insert into t_res values ('11_manager_speakers', (select count(*)::text || ' first=' || coalesce(max(last_name), '-') || ' open=' || coalesce(max(next_open::text), '-') from manager_speakers(v_ed)));

  -- Fremder Manager (anderer Scope) sieht nichts
  select id into v_other from person where id <> v_pid and auth_user_id is null and deleted_at is null limit 1;
  delete from role_assignment where person_id = v_pid;
  begin
    perform update_speaker(v_sp, jsonb_build_object('job_title', 'Hacker'));
    insert into t_res values ('12_update_without_scope', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('12_update_without_scope', 'rejected ' || sqlstate); end;
  insert into t_res values ('13_rls_without_scope', (select count(*)::text from speaker_profile where id = v_sp)); -- als postgres sichtbar (RLS-Bypass), Policy-Test folgt über RPC

  -- Testperson selbst als Speaker (eigenes Profil lesen/schreiben)
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  v_sp2 := upsert_speaker(jsonb_build_object('edition_id', v_ed, 'person_id', v_pid, 'speaker_type', 'keynote', 'hotel_tier', 'vip'));
  delete from role_assignment where person_id = v_pid and role = 'admin';
  v_json := my_speaker_profile();
  insert into t_res values ('14_my_profile', (v_json->>'id' = v_sp2::text)::text || ' assistant=' || (v_json->>'is_assistant') || ' tier=' || (v_json->>'hotel_tier') || ' open=' || (v_json->'next_steps'->>'open'));
  perform update_my_speaker_profile(jsonb_build_object('job_title', 'Founder', 'bio_short_en', 'Short bio', 'internal_notes', 'darf nicht', 'hotel_tier', 'standard'));
  insert into t_res values ('15_self_update_whitelist', (select job_title || ' notes=' || coalesce(internal_notes, 'NULL') || ' tier=' || hotel_tier from speaker_profile where id = v_sp2));

  -- Assistenz einladen (durch den Speaker selbst)
  v_aid := invite_assistant(v_sp2, 'assist-' || gen_random_uuid()::text || '@example.com', 'Alex', 'Assist');
  insert into t_res values ('16_assistant_invited', (select (assistant_person_id = v_aid)::text from speaker_profile where id = v_sp2) || ' role=' || (select count(*)::text from role_assignment where person_id = v_aid and role = 'speaker_assistant' and edition_id = v_ed) || ' mail=' || (select count(*)::text from mail_log where template_key = 'assistant_invite' and person_id = v_aid));
  begin
    perform invite_assistant(v_sp2, v_email);
    insert into t_res values ('17_assistant_is_speaker', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('17_assistant_is_speaker', 'rejected ' || sqlstate); end;
  update role_assignment set valid_from = now() - interval '1 day' where person_id = v_aid and role = 'speaker_assistant'; -- Vergabe liegt in der Praxis vor dem Entzug
  perform remove_assistant(v_sp2);
  insert into t_res values ('18_assistant_removed', (select (assistant_person_id is null)::text from speaker_profile where id = v_sp2) || ' role_active=' || (select count(*)::text from role_assignment where person_id = v_aid and role = 'speaker_assistant' and (valid_to is null or valid_to > now())));

  -- Reisekosten-Freigabe nur Program Lead/Admin
  begin
    perform approve_travel_costs(v_sp2, true);
    insert into t_res values ('19_travel_approve_without_role', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('19_travel_approve_without_role', 'rejected ' || sqlstate); end;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_speaker', 'global');
  perform approve_travel_costs(v_sp2, true);
  insert into t_res values ('20_travel_approved', (select travel_costs_covered::text || ' approved=' || (travel_costs_approved_at is not null)::text from speaker_profile where id = v_sp2));
  insert into t_res values ('21_audit_rows', (select count(*)::text from audit_log where action like 'speaker.%'));
end $$;
select * from t_res order by step;
rollback;

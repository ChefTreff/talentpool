-- Test „Benachrichtigungen“ (TAL-009, 20261002085957_v6_benachrichtigungen.sql). Belegt:
--   01 Vokabular notification_topic mit 7 Begriffen (Academy und Bootcamp getrennt), Abschnitt
--      notifications für admin, area_lead_talent, talent_team, marketing_team;
--   02 Person schreibt eigene Themen unter RLS, fremde nicht;
--   03 Zähler ohne Abschnitt 42501; mit marketing_team: gewählt 3, anschreibbar 1 (ohne
--      Newsletter und mit gesperrter Adresse zählen nicht);
--   04 Export liefert nur die anschreibbare Person, Audit mit Anzahl und ohne Adresse;
--      unbekanntes Thema 22023; anon ohne EXECUTE.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_a uuid; v_a_uid uuid; v_b uuid; v_c uuid; v_staff uuid; v_staff_uid uuid; v_s text; v_n integer; v_mail text; r record;
begin
  select p.id, p.auth_user_id into v_a, v_a_uid from person p where p.auth_user_id is not null and p.deleted_at is null
     and exists (select 1 from person_email e where e.person_id = p.id and e.is_primary) order by p.created_at offset 0 limit 1;
  select p.id into v_b from person p where p.deleted_at is null and p.id <> v_a
     and exists (select 1 from person_email e where e.person_id = p.id and e.is_primary) order by p.created_at offset 1 limit 1;
  select p.id into v_c from person p where p.deleted_at is null and p.id not in (v_a, v_b)
     and exists (select 1 from person_email e where e.person_id = p.id and e.is_primary) order by p.created_at offset 2 limit 1;
  select p.id, p.auth_user_id into v_staff, v_staff_uid from person p where p.auth_user_id is not null and p.deleted_at is null
     and p.id not in (v_a, v_b, v_c) order by p.created_at offset 3 limit 1;
  delete from role_assignment where person_id = v_staff;
  delete from person_interest where vocabulary = 'notification_topic';

  -- 01
  select count(*) into v_n from vocab_term where vocabulary = 'notification_topic' and active;
  select string_agg(role, ',' order by role) into v_s from admin_section_role where section = 'notifications';
  insert into t_res values ('01_vokabular_abschnitt',
    case when v_n = 7 and v_s = 'admin,area_lead_talent,marketing_team,talent_team'
          and exists (select 1 from vocab_term where vocabulary = 'notification_topic' and key = 'academy')
          and exists (select 1 from vocab_term where vocabulary = 'notification_topic' and key = 'bootcamp')
         then 'ok' else v_n || ' ' || coalesce(v_s, '-') end);

  -- 02 eigene Themen unter RLS
  perform set_config('request.jwt.claims', json_build_object('sub', v_a_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into person_interest (person_id, vocabulary, term_key) values (v_a, 'notification_topic', 'summit');
  begin
    insert into person_interest (person_id, vocabulary, term_key) values (v_b, 'notification_topic', 'summit');
    v_s := 'ALLOWED (BUG)';
  exception when others then v_s := 'ok'; end;
  execute 'reset role';
  insert into t_res values ('02_rls', case when v_s = 'ok' and exists (select 1 from person_interest where person_id = v_a and vocabulary = 'notification_topic') then 'ok' else v_s end);

  -- Aufbau (Server): B ohne Newsletter, C mit Newsletter aber gesperrt, A mit Newsletter
  perform set_config('request.jwt.claims', null, true);
  insert into person_interest (person_id, vocabulary, term_key) values (v_b, 'notification_topic', 'summit'), (v_c, 'notification_topic', 'summit');
  insert into consent_record (person_id, consent_type, version, granted, source) values
    (v_a, 'newsletter', 'test', true, 'portal'), (v_b, 'newsletter', 'test', false, 'portal'), (v_c, 'newsletter', 'test', true, 'portal');
  select e.email::text into v_mail from person_email e where e.person_id = v_c and e.is_primary;
  insert into suppression (email_hash, reason) values (email_hash(v_mail), 'manual') on conflict do nothing;

  -- 03
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff_uid, 'role', 'authenticated')::text, true);
  begin perform * from notification_topic_stats(); v_s := 'ALLOWED (BUG)';
  exception when others then v_s := case when sqlstate = '42501' then 'ok' else sqlstate end; end;
  insert into role_assignment (person_id, role, scope_type) values (v_staff, 'marketing_team', 'global');
  select * into r from notification_topic_stats() s where s.topic = 'summit';
  insert into t_res values ('03_zaehler', case when v_s = 'ok' and r.chosen = 3 and r.reachable = 1 then 'ok' else v_s || ' ' || coalesce(r::text, 'leer') end);

  -- 04
  select count(*), max(x.email) into v_n, v_s from notification_topic_export('summit') x;
  insert into t_res values ('04_export',
    case when v_n = 1 and v_s = (select e.email::text from person_email e where e.person_id = v_a and e.is_primary)
          and exists (select 1 from audit_log a where a.action = 'export.notification_topic' and a.object_id = 'summit'
                       and (a.after->>'rows')::int = 1 and a.after::text not like '%@%')
          and not has_function_privilege('anon', 'notification_topic_export(text)', 'execute')
          and not has_function_privilege('authenticated', 'notification_reachable(uuid)', 'execute')
         then 'ok' else 'n=' || v_n end);
  begin perform * from notification_topic_export('gibtsnicht'); v_s := 'ALLOWED (BUG)';
  exception when others then v_s := case when sqlstate = '22023' then 'ok' else sqlstate end; end;
  insert into t_res values ('05_unbekannt', v_s);
end $$;
select * from t_res order by step;
rollback;

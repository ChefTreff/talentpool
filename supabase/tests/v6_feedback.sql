-- Test „Feedback-Fenster“ (TAL-011, 20261002091904_v6_feedback.sql). Belegt:
--   01 Tabellen ohne Grants, Abschnitt feedback; feedback_entry hat **keine** Zeitstempel-Spalte;
--   02 anonym: Zeile ohne person_id, nur Datum, **kein Audit-Eintrag** mit der Person;
--   03 mit Klarnamen: person_id gesetzt; Admin sieht Name und E-Mail nur hier;
--   04 Summit-Bewertungen 1–5 gespeichert, 6 ⇒ 22023 invalid_rating, unbekannte Frage ⇒ 22023;
--      bei anderem Format werden Bewertungen verworfen; leeres Feedback ⇒ missing_field;
--   05 Tageslimit: sechste Einsendung ⇒ feedback_limit; Zähler ohne Bezug zum Text;
--   06 Admin: ohne Abschnitt 42501; set_feedback mit Audit; Mittelwerte; anon ohne EXECUTE.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_me uuid; v_uid uuid; v_staff uuid; v_staff_uid uuid; v_s text; v_n integer; v_id uuid; v_audit_vorher integer; r record; i integer;
begin
  select p.id, p.auth_user_id into v_me, v_uid from person p where p.auth_user_id is not null and p.deleted_at is null
     and exists (select 1 from person_email e where e.person_id = p.id and e.is_primary) order by p.created_at offset 0 limit 1;
  select p.id, p.auth_user_id into v_staff, v_staff_uid from person p where p.auth_user_id is not null and p.deleted_at is null order by p.created_at offset 1 limit 1;
  delete from role_assignment where person_id = v_staff;
  delete from feedback_quota where person_id = v_me;

  -- 01
  insert into t_res values ('01_grants_spalten',
    case when not has_table_privilege('authenticated', 'feedback_entry', 'select')
          and not has_table_privilege('authenticated', 'feedback_quota', 'select')
          and not exists (select 1 from information_schema.columns where table_name = 'feedback_entry'
                           and data_type like 'timestamp%')
          and not exists (select 1 from information_schema.columns where table_name = 'feedback_quota'
                           and data_type like 'timestamp%')
          and (select count(*) from admin_section_role where section = 'feedback') = 4
         then 'ok' else 'FEHLER' end);

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

  -- 02 anonym
  select count(*) into v_audit_vorher from audit_log where actor_person_id = v_me;
  perform submit_feedback('{"format":"portal","kind":"idea","body":"ZZ anonymes Feedback"}'::jsonb, true);
  select * into r from feedback_entry where body = 'ZZ anonymes Feedback';
  insert into t_res values ('02_anonym',
    case when r.person_id is null and r.created_on = current_date
          and (select count(*) from audit_log where actor_person_id = v_me) = v_audit_vorher
         then 'ok' else coalesce(r.person_id::text, 'null') || ' audit=' || ((select count(*) from audit_log where actor_person_id = v_me) - v_audit_vorher) end);

  -- 03 Klarname
  perform submit_feedback('{"format":"masterclass","kind":"praise","body":"ZZ mit Namen"}'::jsonb, false);
  insert into t_res values ('03_klarname',
    case when (select person_id from feedback_entry where body = 'ZZ mit Namen') = v_me then 'ok' else 'FEHLER' end);

  -- 04 Bewertungen
  perform submit_feedback('{"format":"summit","ratings":{"overall":5,"programme":4,"app":"3"},"return_intent":"yes","main_reason":"networking","memorable":"ZZ Keynote"}'::jsonb, true);
  v_s := '';
  begin perform submit_feedback('{"format":"summit","ratings":{"overall":6}}'::jsonb, true); v_s := 'ALLOWED (BUG)';
  exception when others then v_s := case when sqlerrm = 'invalid_rating' then 'ok' else sqlstate end; end;
  begin perform submit_feedback('{"format":"summit","ratings":{"wetter":3}}'::jsonb, true); v_s := v_s || '/ALLOWED (BUG)';
  exception when others then v_s := v_s || case when sqlerrm = 'invalid_rating' then '/ok' else '/' || sqlstate end; end;
  begin perform submit_feedback('{"format":"portal"}'::jsonb, true); v_s := v_s || '/ALLOWED (BUG)';
  exception when others then v_s := v_s || case when sqlerrm = 'missing_field' then '/ok' else '/' || sqlstate end; end;
  insert into t_res values ('04_bewertungen',
    case when v_s = 'ok/ok/ok'
          and (select ratings = '{"overall":5,"programme":4,"app":3}'::jsonb and return_intent = 'yes' from feedback_entry where memorable = 'ZZ Keynote')
         then 'ok' else v_s end);

  -- 05 Tageslimit (bisher 3 erfolgreiche + 3 abgewiesene; abgewiesene zählen nicht, weil die Prüfung vorher scheitert)
  delete from feedback_quota where person_id = v_me;
  for i in 1..5 loop perform submit_feedback(jsonb_build_object('format', 'other', 'body', 'ZZ Limit ' || i), true); end loop;
  begin perform submit_feedback('{"format":"other","body":"ZZ zu viel"}'::jsonb, true); v_s := 'ALLOWED (BUG)';
  exception when others then v_s := case when sqlerrm = 'feedback_limit' then 'ok' else sqlstate end; end;
  insert into t_res values ('05_limit',
    case when v_s = 'ok' and not exists (select 1 from feedback_entry where body = 'ZZ zu viel') then 'ok' else v_s end);

  -- 06 Admin
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff_uid, 'role', 'authenticated')::text, true);
  begin perform * from feedback_admin(); v_s := 'ALLOWED (BUG)';
  exception when others then v_s := case when sqlstate = '42501' then 'ok' else sqlstate end; end;
  insert into role_assignment (person_id, role, scope_type) values (v_staff, 'marketing_team', 'global');
  select * into r from feedback_admin() f where f.body = 'ZZ mit Namen';
  select id into v_id from feedback_entry where body = 'ZZ anonymes Feedback';
  perform set_feedback(v_id, 'seen', array['portal', 'navigation']);
  select count(*) into v_n from feedback_admin() f where f.body = 'ZZ anonymes Feedback' and f.anonymous and f.first_name is null and f.email is null;
  insert into t_res values ('06_admin',
    case when v_s = 'ok' and not r.anonymous and r.email is not null and v_n = 1
          and (select tags from feedback_entry where id = v_id) @> array['portal']
          and exists (select 1 from audit_log a where a.action = 'feedback.updated' and a.object_id = v_id::text)
          and (select average from feedback_summit_summary() where question = 'overall') is not null
          and not has_function_privilege('anon', 'submit_feedback(jsonb,boolean)', 'execute')
          and not has_function_privilege('anon', 'feedback_admin()', 'execute')
         then 'ok' else v_s || ' n=' || v_n end);
end $$;
select * from t_res order by step;
rollback;

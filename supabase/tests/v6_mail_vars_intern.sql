-- Test „session_mail_vars nur intern“ (0181, F11). Belegt:
--   01 anon und authenticated haben kein EXECUTE mehr, der Besitzer schon;
--   02 ein Aufruf als authenticated scheitert mit 42501 (echter Rollenwechsel);
--   03 die Definer-Aufrufer sind weiterhin ausführbar (der Erinnerungslauf ist SECURITY DEFINER).
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_uid uuid; v_s text; v_sid uuid;
begin
  insert into t_res values ('01_grants',
    case when not has_function_privilege('anon', 'session_mail_vars(uuid, text)', 'execute')
          and not has_function_privilege('authenticated', 'session_mail_vars(uuid, text)', 'execute')
          and has_function_privilege(current_user, 'session_mail_vars(uuid, text)', 'execute')
         then 'ok' else 'FEHLER' end);
  select p.auth_user_id into v_uid from person p where p.auth_user_id is not null and p.deleted_at is null limit 1;
  select s.id into v_sid from session s limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform session_mail_vars(v_sid, 'de'); v_s := 'ALLOWED (BUG)';
  exception when others then v_s := case when sqlstate = '42501' then 'ok' else sqlstate end;
  end;
  execute 'reset role';
  insert into t_res values ('02_aufruf_als_authenticated', v_s);
  insert into t_res values ('03_definer_aufrufer',
    case when (select bool_and(p.prosecdef) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname in ('application_mail_trigger','registration_mail_trigger','decision_release_mail_trigger','send_presentation_reminders'))
         then 'ok' else 'FEHLER' end);
end $$;
select * from t_res order by step;
rollback;

-- Test „Admin Teilnehmer-Tickets“ (TAL-019 Teil 2, v6_ticket_personalisierung_admin.sql). Belegt:
--   01 ohne Rolle: Übersicht und Liste 42501;
--   02 Rolle talent_team (Abschnitt applications): Übersicht zählt nur source vivenu + valid (Storno und Speaker-Ticket fehlen),
--      je Status und Rückschreiben offen;
--   03 Liste: nur pending/partial, complete fehlt, Limit greift, Spaltenliste ohne Barcode/Secret;
--   04 Fremdrolle (partner_team) ⇒ 42501; 05 anon ohne EXECUTE.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_ev uuid; v_s text; v_n integer; r record;
begin
  select p.id, p.auth_user_id into v_pid, v_uid from person p where p.auth_user_id is not null and p.deleted_at is null order by p.created_at limit 1;
  delete from role_assignment where person_id = v_pid;
  insert into event (name, format_tag, is_edition, slug) values ('TEST Ed T19b', 'edition', true, 't-ed-t19b') returning id into v_ev;
  insert into ticket (event_id, vivenu_ticket_id, buyer_email, status, source, personalization_status) values
    (v_ev, 'zz-t19b-1', 'zz-a@example.org', 'valid', 'vivenu', 'pending'),
    (v_ev, 'zz-t19b-2', 'zz-b@example.org', 'valid', 'vivenu', 'partial'),
    (v_ev, 'zz-t19b-3', 'zz-c@example.org', 'valid', 'vivenu', 'complete'),
    (v_ev, 'zz-t19b-4', 'zz-d@example.org', 'cancelled', 'vivenu', 'pending'),
    (v_ev, 'zz-t19b-5', 'zz-e@example.org', 'valid', 'speaker', 'pending');
  update ticket set vivenu_writeback_pending = true where vivenu_ticket_id = 'zz-t19b-2';

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  v_s := '';
  begin perform * from ticket_personalization_overview(v_ev); v_s := 'ALLOWED (BUG)'; exception when others then v_s := case when sqlstate = '42501' then 'ok' else sqlstate end; end;
  begin perform * from tickets_unpersonalized(v_ev); v_s := v_s || '/ALLOWED (BUG)'; exception when others then v_s := v_s || case when sqlstate = '42501' then '/ok' else '/' || sqlstate end; end;
  insert into t_res values ('01_ohne_rolle', case when v_s = 'ok/ok' then 'ok' else v_s end);

  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'talent_team', 'global');
  select * into r from ticket_personalization_overview(v_ev);
  insert into t_res values ('02_zahlen', case when r.pending = 1 and r.partial = 1 and r.complete = 1 and r.writeback_open = 1 then 'ok'
    else format('p=%s pa=%s c=%s w=%s', r.pending, r.partial, r.complete, r.writeback_open) end);

  select count(*) into v_n from tickets_unpersonalized(v_ev);
  insert into t_res values ('03a_liste', case when v_n = 2 and not exists (select 1 from tickets_unpersonalized(v_ev) x where x.buyer_email = 'zz-c@example.org') then 'ok' else 'n=' || v_n end);
  select count(*) into v_n from tickets_unpersonalized(v_ev, 1);
  insert into t_res values ('03b_limit', case when v_n = 1 then 'ok' else 'n=' || v_n end);
  insert into t_res values ('03c_spalten', case when not exists (
      select 1 from pg_proc p, unnest(p.proargnames) a where p.proname = 'tickets_unpersonalized' and a in ('barcode', 'secret')) then 'ok' else 'FEHLER' end);

  delete from role_assignment where person_id = v_pid;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'partner_team', 'global');
  v_s := '';
  begin perform * from tickets_unpersonalized(v_ev); v_s := 'ALLOWED (BUG)'; exception when others then v_s := case when sqlstate = '42501' then 'ok' else sqlstate end; end;
  insert into t_res values ('04_fremdrolle', v_s);

  insert into t_res values ('05_anon', case when not has_function_privilege('anon', 'ticket_personalization_overview(uuid)', 'execute')
    and not has_function_privilege('anon', 'tickets_unpersonalized(uuid,integer)', 'execute') then 'ok' else 'FEHLER' end);
end $$;
select * from t_res order by step;
rollback;

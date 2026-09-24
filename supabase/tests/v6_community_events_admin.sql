-- Test „Admin-Sicht Community-Events" (TAL-008, vorschlag/v6_community_events_admin.sql).
-- Setzt v6_luma_events voraus (Probelauf mit beiden Dateien, siehe unten). Belegt:
--   01 ohne Rolle 42501 für beide Funktionen; ohne Person 28000;
--   02 area_lead_talent sieht das Event mit richtigen Zählern (confirmed, attended, total);
--   03 marketing_team sieht die Gäste mit Name und Status; die Spaltenliste hat keine E-Mail;
--   04 area_lead_partner nicht (42501);
--   05 ein Event ohne Luma-Verweis erscheint nicht;
--   06 talent_team (Rollenmodell 0162) sieht die Liste.
--
-- Probelauf der Build-Session am 25.09.2026 gegen die Live-Datenbank (v6_luma_events live als 20260924142616;
-- alles zurueckgerollt): 6 von 6 Schritten gruen.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_other uuid; v_email2 text; v_ev uuid; v_plain uuid; v_s text; r record;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null limit 1;
  select p.id, pe.email::text into v_other, v_email2 from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.id <> v_pid and p.deleted_at is null limit 1;

  -- Aufbau im Serverkontext
  perform set_config('request.jwt.claims', null, true);
  v_ev := luma_sync_event(jsonb_build_object('luma_id', 'evt-admin-test', 'name', 'Admin-Test-Night',
            'start_at', '2026-10-15T17:00:00Z', 'end_at', '2026-10-15T20:00:00Z', 'url', 'https://luma.com/admintest'));
  perform luma_sync_registration('evt-admin-test', v_email, 'gst-a1', 'registered');
  perform luma_sync_registration('evt-admin-test', v_email2, 'gst-a2', 'registered', null, true);
  insert into event (name, format_tag, is_edition) values ('Ohne Luma', 'community', false) returning id into v_plain;

  delete from role_assignment where person_id = v_pid;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

  -- 01 ohne Rolle
  begin perform * from community_events_admin(); v_s := 'ALLOWED (BUG)';
  exception when others then v_s := case when sqlstate = '42501' then 'ok' else sqlstate end; end;
  begin perform * from community_event_guests_admin(v_ev); v_s := v_s || '/ALLOWED (BUG)';
  exception when others then v_s := v_s || case when sqlstate = '42501' then '/ok' else '/' || sqlstate end; end;
  perform set_config('request.jwt.claims', null, true);
  begin perform * from community_events_admin(); v_s := v_s || '/ALLOWED (BUG)';
  exception when others then v_s := v_s || case when sqlstate = '28000' then '/ok' else '/' || sqlstate end; end;
  insert into t_res values ('01_ohne_rolle', case when v_s = 'ok/ok/ok' then 'ok' else v_s end);
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

  -- 02 area_lead_talent
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_talent', 'global');
  select * into r from community_events_admin() c where c.event_id = v_ev;
  insert into t_res values ('02_zaehler',
    case when r.registered = 1 and r.attended = 1 and r.total = 2 and r.url = 'https://luma.com/admintest'
         then 'ok' else coalesce(r::text, 'leer') end);
  delete from role_assignment where person_id = v_pid;

  -- 03 marketing_team, Gäste ohne E-Mail
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'marketing_team', 'global');
  select string_agg(g.status, ',' order by g.status) into v_s from community_event_guests_admin(v_ev) g;
  insert into t_res values ('03_gaeste_ohne_mail',
    case when v_s = 'attended,confirmed'
          and pg_get_function_result('community_event_guests_admin(uuid)'::regprocedure) not ilike '%mail%'
         then 'ok' else coalesce(v_s, 'leer') end);
  delete from role_assignment where person_id = v_pid;

  -- 04 area_lead_partner
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_partner', 'global');
  begin perform * from community_events_admin(); v_s := 'ALLOWED (BUG)';
  exception when others then v_s := case when sqlstate = '42501' then 'ok' else sqlstate end; end;
  insert into t_res values ('04_partner_lead', v_s);
  delete from role_assignment where person_id = v_pid;

  -- 05 ohne Luma-Verweis
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  insert into t_res values ('05_ohne_verweis',
    case when not exists (select 1 from community_events_admin() c where c.event_id = v_plain) then 'ok' else 'FEHLER' end);
  delete from role_assignment where person_id = v_pid;

  -- 06 talent_team
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'talent_team', 'global');
  begin
    select count(*)::text into v_s from community_events_admin() c where c.event_id = v_ev;
  exception when others then v_s := sqlstate;
  end;
  insert into t_res values ('06_talent_team', case when v_s = '1' then 'ok' else v_s end);
end $$;
select * from t_res order by step;
rollback;

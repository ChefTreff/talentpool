-- Smoke-Test 0034: Speaker-Ticket (automatisch ab 'confirmed'), Begleitticket (Anfrage/Rückzug/Bestätigung/Ablehnung), Ausstellung, Sync bei Absage, hospitality_block_reason 'declined'.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_sp uuid; v_own uuid; v_c1 uuid; v_c2 uuid; v_json jsonb; v_detail text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary where p.auth_user_id is not null limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  delete from role_assignment where person_id = v_pid; delete from staff_user where auth_user_id = v_uid; -- Testperson ohne Vorrechte (Rollback stellt alles wieder her)
  select id into v_ed from event where is_edition and slug = 'fls27';

  -- Speaker anlegen (Admin-Bootstrap): Pipeline 'lead' ⇒ kein Ticket, kein Anspruch
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  v_sp := upsert_speaker(jsonb_build_object('edition_id', v_ed, 'person_id', v_pid, 'speaker_type', 'keynote'));
  insert into t_res values ('01_lead_no_ticket', (select count(*)::text from ticket where speaker_profile_id = v_sp) || ' eligible=' || (my_speaker_tickets()->>'eligible'));
  begin
    perform request_companion_ticket(v_sp, 'guest@example.com', 'Gast', 'Eins');
    insert into t_res values ('02_companion_before_confirmed', 'ALLOWED (BUG)');
  exception when others then get stacked diagnostics v_detail = pg_exception_detail; insert into t_res values ('02_companion_before_confirmed', 'rejected ' || sqlerrm || ' ' || coalesce(v_detail, '')); end;
  -- Bestätigt ⇒ Speaker-Ticket entsteht automatisch (requested, ohne Barcode)
  perform set_speaker_pipeline(v_sp, 'confirmed');
  select id into v_own from ticket where speaker_profile_id = v_sp and source = 'speaker' and status <> 'cancelled';
  insert into t_res values ('03_auto_ticket', (select status || ' pass=' || pass_type || ' lounge=' || lounge_access::text || ' barcode_null=' || (barcode is null)::text
                                                 || ' holder_ok=' || (holder_email = v_email::citext)::text || ' person_ok=' || (person_id = v_pid)::text from ticket where id = v_own));
  perform set_speaker_pipeline(v_sp, 'onboarded');
  insert into t_res values ('04_still_one_ticket', (select count(*)::text from ticket where speaker_profile_id = v_sp and source = 'speaker' and status <> 'cancelled'));
  perform update_speaker(v_sp, jsonb_build_object('pass_type', 'professional', 'lounge_access', false));
  insert into t_res values ('05_pass_sync', (select pass_type || ' lounge=' || lounge_access::text from ticket where id = v_own));
  perform update_speaker(v_sp, jsonb_build_object('pass_type', 'speaker', 'lounge_access', true));
  delete from role_assignment where person_id = v_pid and role = 'admin';

  -- Speaker ohne Rollen: Begleitticket anfragen
  begin
    perform request_companion_ticket(v_sp, 'kein-mail', 'Gast', 'Eins');
    insert into t_res values ('06_invalid_email', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('06_invalid_email', 'rejected ' || sqlerrm); end;
  begin
    perform request_companion_ticket(v_sp, v_email, 'Ich', 'Selbst');
    insert into t_res values ('07_companion_is_speaker', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('07_companion_is_speaker', 'rejected ' || sqlerrm); end;
  v_c1 := request_companion_ticket(v_sp, ' Guest.One@Example.com ', 'Gast', 'Eins');
  insert into t_res values ('08_companion_requested', (select status || ' pass=' || pass_type || ' lounge=' || lounge_access::text || ' email=' || holder_email::text from ticket where id = v_c1)
                                                       || ' mails_team=' || (select count(*)::text from mail_log where template_key = 'companion_ticket_requested' and related_id = v_c1));
  begin
    perform request_companion_ticket(v_sp, 'guest.two@example.com', 'Gast', 'Zwei');
    insert into t_res values ('09_second_companion', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('09_second_companion', 'rejected ' || sqlstate); end;
  v_json := my_speaker_tickets();
  insert into t_res values ('10_my_tickets', 'own=' || (v_json->'own'->>'status') || ' companion=' || (v_json->'companion'->>'status') || ' companion_email=' || (v_json->'companion'->>'email') || ' eligible=' || (v_json->>'eligible'));
  begin
    perform confirm_companion_ticket(v_c1);
    insert into t_res values ('11_confirm_as_speaker', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('11_confirm_as_speaker', 'rejected ' || sqlstate); end;
  begin
    perform set_ticket_issued(v_own, 'viv-1', 'BC-1');
    insert into t_res values ('12_issue_as_speaker', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('12_issue_as_speaker', 'rejected ' || sqlstate); end;
  begin
    perform count(*) from speaker_tickets_admin(v_ed);
    insert into t_res values ('13_admin_list_as_speaker', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('13_admin_list_as_speaker', 'rejected ' || sqlstate); end;
  perform cancel_companion_ticket(v_c1);
  insert into t_res values ('14_cancelled_by_speaker', (select status from ticket where id = v_c1));
  v_c2 := request_companion_ticket(v_sp, 'guest.two@example.com', 'Gast', 'Zwei');
  insert into t_res values ('15_new_companion_after_cancel', (v_c2 <> v_c1)::text);

  -- Team (area_lead_speaker): Ablehnung mit Grund, neue Anfrage benachrichtigt den Lead, Bestätigung, Ausstellung
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_speaker', 'global');
  begin
    perform decline_companion_ticket(v_c2, '');
    insert into t_res values ('16_decline_without_note', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('16_decline_without_note', 'rejected ' || sqlerrm); end;
  perform decline_companion_ticket(v_c2, 'Bitte den Namen des Gastes vervollständigen');
  insert into t_res values ('17_declined', (select status || ' note=' || team_note from ticket where id = v_c2) || ' mail=' || (select count(*)::text from mail_log where template_key = 'companion_ticket_declined' and related_id = v_c2));
  v_c1 := request_companion_ticket(v_sp, 'guest.three@example.com', 'Gast', 'Drei');
  insert into t_res values ('18_request_notifies_lead', (select count(*)::text from mail_log where template_key = 'companion_ticket_requested' and related_id = v_c1));
  perform confirm_companion_ticket(v_c1, 'Gern');
  insert into t_res values ('19_approved', (select status || ' approved_by_ok=' || (approved_by = v_pid)::text from ticket where id = v_c1) || ' mail=' || (select count(*)::text from mail_log where template_key = 'companion_ticket_confirmed' and related_id = v_c1));
  begin
    perform confirm_companion_ticket(v_c1);
    insert into t_res values ('20_double_confirm', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('20_double_confirm', 'rejected ' || sqlerrm); end;
  perform set_ticket_issued(v_c1, 'viv-c-1', 'BC-C-1');
  perform set_ticket_issued(v_own, 'viv-s-1', 'BC-S-1', 'tx-1');
  insert into t_res values ('21_issued', (select string_agg(source || ':' || status || ':' || coalesce(barcode, '-'), ', ' order by source) from ticket where speaker_profile_id = v_sp and status = 'valid'));
  begin
    perform set_ticket_issued(v_own, 'viv-s-2', 'BC-S-2');
    insert into t_res values ('22_double_issue', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('22_double_issue', 'rejected ' || sqlerrm); end;
  v_json := my_speaker_tickets();
  insert into t_res values ('23_my_tickets_issued', 'own_barcode=' || (v_json->'own'->>'barcode') || ' companion_issued=' || (v_json->'companion'->>'issued')
                                                     || ' companion_barcode_hidden=' || (not (v_json->'companion' ? 'barcode'))::text || ' history=' || jsonb_array_length(v_json->'companion_history')::text);
  insert into t_res values ('24_admin_list', (select count(*)::text || ' statuses=' || string_agg(status, ',' order by status) from speaker_tickets_admin(v_ed) where profile_id = v_sp));
  -- Team storniert ein ausgestelltes Begleitticket; Absage des Speakers zieht offene Freitickets zurück, ausgestellte bleiben
  perform cancel_companion_ticket(v_c1);
  insert into t_res values ('25_team_cancels_issued', (select status from ticket where id = v_c1));
  v_c2 := request_companion_ticket(v_sp, 'guest.four@example.com', 'Gast', 'Vier');
  perform set_speaker_pipeline(v_sp, 'declined');
  insert into t_res values ('26_pipeline_declined', (select string_agg(source || ':' || status, ', ' order by source) from ticket where id in (v_own, v_c2)));
  perform update_speaker(v_sp, jsonb_build_object('hospitality_status', 'declined'));
  insert into t_res values ('27_block_reason_declined', hospitality_block_reason(v_sp));
  insert into t_res values ('28_audit', (select string_agg(action || '=' || n::text, ', ' order by action) from (select action, count(*) n from audit_log where action like 'ticket.%' and created_at >= now() group by action) s));
end $$;
select * from t_res order by step;
rollback;

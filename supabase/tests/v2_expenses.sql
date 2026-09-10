-- Smoke-Test 0031–0033: Reisekosten — Freischaltung, Positionen, Belege, Bankdaten im Vault (nur Speaker), Einreichung, Freigabe, Mails, Auszahlung.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_sp uuid; v_claim uuid; v_receipt uuid; v_no text; v_json jsonb; v_lead uuid; v_detail text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary where p.auth_user_id is not null limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  delete from role_assignment where person_id = v_pid; delete from staff_user where auth_user_id = v_uid; -- Testperson ohne Vorrechte (Rollback stellt alles wieder her)
  select id into v_ed from event where is_edition and slug = 'fls27';
  insert into t_res values ('00_iban_check', iban_valid('DE89 3704 0044 0532 0130 00')::text || ' falsch=' || iban_valid('DE89370400440532013001')::text || ' kurz=' || iban_valid('DE12')::text);
  insert into t_res values ('00b_fmt', fmt_cents(123456, 'de') || ' | ' || fmt_cents(123456, 'en'));

  -- Testperson als Speaker (Admin-Bootstrap), Reisekosten noch nicht freigegeben
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  v_sp := upsert_speaker(jsonb_build_object('edition_id', v_ed, 'person_id', v_pid, 'speaker_type', 'keynote'));
  delete from role_assignment where person_id = v_pid and role = 'admin';
  insert into t_res values ('01_eligibility_none', (expense_eligibility()->>'eligible') || ' reason=' || (expense_eligibility()->>'reason'));
  begin
    perform upsert_expense_claim(jsonb_build_object('positions', jsonb_build_array(jsonb_build_object('date', '2027-04-15', 'category', 'train', 'amount_cents', 8900))));
    insert into t_res values ('02_claim_without_eligibility', 'ALLOWED (BUG)');
  exception when others then get stacked diagnostics v_detail = pg_exception_detail; insert into t_res values ('02_claim_without_eligibility', 'rejected ' || sqlerrm || ' ' || coalesce(v_detail, '')); end;
  update speaker_profile set travel_costs_covered = true where id = v_sp;
  insert into t_res values ('03_eligibility_not_approved', (expense_eligibility()->>'reason'));
  update speaker_profile set travel_costs_approved_at = now(), travel_costs_approved_by = v_pid where id = v_sp;

  -- Entwurf mit Prüfungen
  begin
    perform upsert_expense_claim(jsonb_build_object('positions', jsonb_build_array(jsonb_build_object('date', '2027-04-15', 'category', 'jet', 'amount_cents', 100))));
    insert into t_res values ('04_invalid_category', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('04_invalid_category', 'rejected ' || sqlerrm); end;
  begin
    perform upsert_expense_claim(jsonb_build_object('positions', jsonb_build_array(jsonb_build_object('date', '2027-04-15', 'category', 'train', 'amount_cents', -5))));
    insert into t_res values ('05_invalid_amount', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('05_invalid_amount', 'rejected ' || sqlerrm); end;
  v_claim := upsert_expense_claim(jsonb_build_object('positions', jsonb_build_array(
    jsonb_build_object('date', '2027-04-15', 'category', 'train', 'description', 'ICE Berlin–Hamburg', 'amount_cents', 8900),
    jsonb_build_object('date', '2027-04-16', 'category', 'local_transport', 'description', 'Taxi', 'amount_cents', 2450))));
  insert into t_res values ('06_draft', (select status || ' sum=' || amount_cents::text from expense_claim where id = v_claim));
  insert into t_res values ('07_second_call_updates_same_draft', (upsert_expense_claim(jsonb_build_object('positions', '[]'::jsonb)) = v_claim)::text);
  perform upsert_expense_claim(jsonb_build_object('id', v_claim, 'positions', jsonb_build_array(jsonb_build_object('date', '2027-04-15', 'category', 'train', 'description', 'ICE', 'amount_cents', 8900))));

  -- Einreichen scheitert ohne Beleg und ohne Bankdaten
  begin
    perform submit_expense(v_claim);
    insert into t_res values ('08_submit_without_receipt', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('08_submit_without_receipt', 'rejected ' || sqlerrm); end;
  insert into storage.objects (bucket_id, name, owner_id, metadata) values ('speaker-assets', v_ed::text || '/' || v_sp::text || '/receipt/beleg.pdf', v_uid::text, '{}'::jsonb);
  v_json := register_speaker_asset(v_sp, 'receipt', v_ed::text || '/' || v_sp::text || '/receipt/beleg.pdf', 'beleg.pdf', 'application/pdf', 1000);
  v_receipt := (v_json->>'id')::uuid;
  perform upsert_expense_claim(jsonb_build_object('id', v_claim, 'positions', jsonb_build_array(jsonb_build_object('date', '2027-04-15', 'category', 'train', 'description', 'ICE', 'amount_cents', 8900, 'receipt_asset_id', v_receipt))));
  begin
    perform submit_expense(v_claim);
    insert into t_res values ('09_submit_without_bank', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('09_submit_without_bank', 'rejected ' || sqlerrm); end;
  begin
    perform set_expense_bank_details(v_claim, 'DE89370400440532013001', null, 'Konrad Test');
    insert into t_res values ('10_invalid_iban', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('10_invalid_iban', 'rejected ' || sqlerrm); end;
  perform set_expense_bank_details(v_claim, 'DE89 3704 0044 0532 0130 00', 'COBADEFFXXX', 'Konrad Test');
  insert into t_res values ('11_bank_stored_masked', (select bank_masked || ' holder=' || bank_holder || ' vault=' || (bank_secret_id is not null)::text from expense_claim where id = v_claim));
  insert into t_res values ('12_no_plaintext_in_table', (select (count(*) = 0)::text from expense_claim where positions::text like '%DE89%' or bank_masked like '%3704%'));

  -- Einreichen: Nummer, Mail an Freigeber (kein area_lead_speaker aktiv -> Admin-Fallback: Testperson ist gerade kein Admin -> 0 Mails)
  v_no := submit_expense(v_claim);
  insert into t_res values ('13_submitted', v_no || ' status=' || (select status from expense_claim where id = v_claim));
  begin
    perform upsert_expense_claim(jsonb_build_object('id', v_claim, 'positions', '[]'::jsonb));
    insert into t_res values ('14_edit_after_submit', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('14_edit_after_submit', 'rejected ' || sqlerrm); end;
  insert into t_res values ('15_my_claims', (select count(*)::text || ' has_bank=' || bool_and(has_bank)::text || ' label=' || max(amount_label) from my_expense_claims()));

  -- Freigabe nur area_lead_speaker/Admin; Bankdaten nur dort lesbar (Audit)
  begin
    perform approve_expense(v_claim, 'ok');
    insert into t_res values ('16_approve_as_speaker', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('16_approve_as_speaker', 'rejected ' || sqlstate); end;
  begin
    perform expense_bank_details(v_claim);
    insert into t_res values ('17_bank_view_as_speaker', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('17_bank_view_as_speaker', 'rejected ' || sqlstate); end;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_speaker', 'global');
  insert into t_res values ('18_queue', (select count(*)::text || ' status=' || max(status) || ' masked=' || max(bank_masked) from expense_queue(v_ed)));
  insert into t_res values ('19_bank_view_as_lead', (select (expense_bank_details(v_claim)->>'iban' = 'DE89370400440532013000')::text || ' bic=' || (expense_bank_details(v_claim)->>'bic')));
  perform reject_expense(v_claim, 'Bitte Bahnticket als Beleg nachreichen');
  insert into t_res values ('20_rejected', (select status || ' note=' || review_note from expense_claim where id = v_claim) || ' mail=' || (select count(*)::text from mail_log where template_key = 'expense_rejected' and related_id = v_claim));
  -- Speaker überarbeitet (rejected -> draft), reicht erneut ein, Lead gibt frei, zahlt aus
  perform upsert_expense_claim(jsonb_build_object('id', v_claim, 'positions', jsonb_build_array(jsonb_build_object('date', '2027-04-15', 'category', 'train', 'description', 'ICE', 'amount_cents', 8900, 'receipt_asset_id', v_receipt))));
  insert into t_res values ('21_back_to_draft', (select status from expense_claim where id = v_claim));
  insert into t_res values ('22_resubmit_keeps_no', (submit_expense(v_claim) = v_no)::text);
  perform approve_expense(v_claim, 'passt');
  insert into t_res values ('23_approved_mail', (select status from expense_claim where id = v_claim) || ' mail=' || (select count(*)::text from mail_log where template_key = 'expense_approved' and related_id = v_claim) || ' submitted_mails=' || (select count(*)::text from mail_log where template_key = 'expense_submitted' and related_id = v_claim));
  perform set_expense_integration(v_claim, null, 'SD-123', true);
  perform mark_expense_paid(v_claim, 'Überweisung 2027-04-20');
  insert into t_res values ('24_paid', (select status || ' sevdesk=' || coalesce(sevdesk_ref, '-') || ' qonto=' || (qonto_sent_at is not null)::text from expense_claim where id = v_claim));
  insert into t_res values ('25_audit', (select string_agg(action || '=' || n::text, ', ' order by action) from (select action, count(*) n from audit_log where action like 'expense.%' group by action) s));
end $$;
select * from t_res order by step;
rollback;

create or replace function submit_expense(p_claim_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_c expense_claim%rowtype; v_sp speaker_profile%rowtype; v_me uuid := current_person_id(); v_elig jsonb; v_no text; r record; v_notified integer := 0; v_speaker text;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_c from expense_claim where id = p_claim_id for update;
  if not found then raise exception 'claim_not_found' using errcode = 'P0002'; end if;
  select * into v_sp from speaker_profile where id = v_c.profile_id;
  if v_sp.person_id <> v_me then raise exception 'not allowed' using errcode = '42501', detail = 'speaker_only'; end if;
  if v_c.status not in ('draft', 'rejected') then raise exception 'not_editable' using errcode = 'P0001', detail = v_c.status; end if;
  v_elig := expense_eligibility(v_sp.id);
  if not (v_elig->>'eligible')::boolean then raise exception 'not_eligible' using errcode = 'P0001', detail = v_elig->>'reason'; end if;
  if jsonb_array_length(v_c.positions) = 0 then raise exception 'positions_required' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements(v_c.positions) x where nullif(x->>'receipt_asset_id', '') is null) then
    raise exception 'receipt_required' using errcode = 'P0001';
  end if;
  if v_c.bank_secret_id is null then raise exception 'bank_required' using errcode = 'P0001'; end if;
  v_no := coalesce(v_c.invoice_no, 'RK-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('expense_invoice_seq')::text, 4, '0'));
  update expense_claim set status = 'submitted', submitted_at = now(), submitted_by = v_me, invoice_no = v_no, review_note = null where id = p_claim_id;
  select btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) into v_speaker from person p where p.id = v_sp.person_id;
  for r in
    select distinct ra.person_id from role_assignment ra
    where ra.role = 'area_lead_speaker' and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now())
  loop
    perform queue_mail('expense_submitted', r.person_id, jsonb_build_object('speaker_name', v_speaker, 'amount', fmt_cents(v_c.amount_cents, 'de'), 'positions', jsonb_array_length(v_c.positions), 'invoice_no', v_no), 'expense_claim', p_claim_id);
    v_notified := v_notified + 1;
  end loop;
  if v_notified = 0 then
    for r in
      select distinct ra.person_id from role_assignment ra
      where ra.role = 'admin' and ra.scope_type = 'global' and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now())
    loop
      perform queue_mail('expense_submitted', r.person_id, jsonb_build_object('speaker_name', v_speaker, 'amount', fmt_cents(v_c.amount_cents, 'de'), 'positions', jsonb_array_length(v_c.positions), 'invoice_no', v_no), 'expense_claim', p_claim_id);
    end loop;
  end if;
  perform log_audit('expense.submit', 'expense_claim', p_claim_id::text, null, jsonb_build_object('invoice_no', v_no, 'amount_cents', v_c.amount_cents));
  return v_no;
end $$;

create or replace function approve_expense(p_claim_id uuid, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_c expense_claim%rowtype; v_sp speaker_profile%rowtype; v_locale text;
begin
  if not is_expense_approver() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_c from expense_claim where id = p_claim_id for update;
  if not found then raise exception 'claim_not_found' using errcode = 'P0002'; end if;
  if v_c.status <> 'submitted' then raise exception 'not_pending' using errcode = 'P0001', detail = v_c.status; end if;
  select * into v_sp from speaker_profile where id = v_c.profile_id;
  update expense_claim set status = 'approved', reviewed_by = current_person_id(), reviewed_at = now(), review_note = nullif(btrim(p_note), '') where id = p_claim_id;
  select coalesce(p.preferred_language, 'en') into v_locale from person p where p.id = v_sp.person_id;
  perform queue_mail('expense_approved', v_sp.person_id, jsonb_build_object('amount', fmt_cents(v_c.amount_cents, v_locale), 'invoice_no', v_c.invoice_no, 'note', coalesce(p_note, '')), 'expense_claim', p_claim_id);
  perform log_audit('expense.approve', 'expense_claim', p_claim_id::text, jsonb_build_object('status', v_c.status), jsonb_build_object('status', 'approved', 'note', p_note));
end $$;

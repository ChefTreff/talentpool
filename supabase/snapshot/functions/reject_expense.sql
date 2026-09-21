create or replace function reject_expense(p_claim_id uuid, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_c expense_claim%rowtype; v_sp speaker_profile%rowtype; v_locale text;
begin
  if not is_expense_approver() then raise exception 'not allowed' using errcode = '42501'; end if;
  if nullif(btrim(coalesce(p_note, '')), '') is null then raise exception 'note_required' using errcode = '22023'; end if;
  select * into v_c from expense_claim where id = p_claim_id for update;
  if not found then raise exception 'claim_not_found' using errcode = 'P0002'; end if;
  if v_c.status <> 'submitted' then raise exception 'not_pending' using errcode = 'P0001', detail = v_c.status; end if;
  select * into v_sp from speaker_profile where id = v_c.profile_id;
  update expense_claim set status = 'rejected', reviewed_by = current_person_id(), reviewed_at = now(), review_note = btrim(p_note) where id = p_claim_id;
  select coalesce(p.preferred_language, 'en') into v_locale from person p where p.id = v_sp.person_id;
  perform queue_mail('expense_rejected', v_sp.person_id, jsonb_build_object('amount', fmt_cents(v_c.amount_cents, v_locale), 'invoice_no', v_c.invoice_no, 'note', btrim(p_note)), 'expense_claim', p_claim_id);
  perform log_audit('expense.reject', 'expense_claim', p_claim_id::text, jsonb_build_object('status', v_c.status), jsonb_build_object('status', 'rejected', 'note', p_note));
end $$;

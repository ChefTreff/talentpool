create or replace function mark_expense_paid(p_claim_id uuid, p_payment_ref text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_c expense_claim%rowtype;
begin
  if not is_expense_approver() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_c from expense_claim where id = p_claim_id for update;
  if not found then raise exception 'claim_not_found' using errcode = 'P0002'; end if;
  if v_c.status <> 'approved' then raise exception 'not_approved' using errcode = 'P0001', detail = v_c.status; end if;
  update expense_claim set status = 'paid', paid_at = now(), paid_by = current_person_id(), payment_ref = nullif(btrim(p_payment_ref), '') where id = p_claim_id;
  perform log_audit('expense.paid', 'expense_claim', p_claim_id::text, null, jsonb_build_object('payment_ref', p_payment_ref));
end $$;

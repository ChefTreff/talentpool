create or replace function set_expense_integration(p_claim_id uuid, p_invoice_asset_id uuid DEFAULT NULL::uuid, p_sevdesk_ref text DEFAULT NULL::text, p_qonto_sent boolean DEFAULT NULL::boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_status text;
begin
  if auth.uid() is not null and not is_expense_approver() then raise exception 'not allowed' using errcode = '42501'; end if;
  select status into v_status from expense_claim where id = p_claim_id;
  if not found then raise exception 'claim_not_found' using errcode = 'P0002'; end if;
  if v_status not in ('approved', 'paid') then raise exception 'not_approved' using errcode = 'P0001', detail = v_status; end if;
  update expense_claim set
    invoice_asset_id = coalesce(p_invoice_asset_id, invoice_asset_id),
    sevdesk_ref      = coalesce(nullif(btrim(p_sevdesk_ref), ''), sevdesk_ref),
    sevdesk_sent_at  = case when nullif(btrim(p_sevdesk_ref), '') is not null then now() else sevdesk_sent_at end,
    qonto_sent_at    = case when coalesce(p_qonto_sent, false) then now() else qonto_sent_at end
  where id = p_claim_id;
  insert into audit_log (actor_person_id, actor_auth_uid, action, object_type, object_id, after)
  values (current_person_id(), auth.uid(), 'expense.integration', 'expense_claim', p_claim_id::text,
          jsonb_build_object('invoice_asset_id', p_invoice_asset_id, 'sevdesk_ref', p_sevdesk_ref, 'qonto_sent', p_qonto_sent));
end $$;

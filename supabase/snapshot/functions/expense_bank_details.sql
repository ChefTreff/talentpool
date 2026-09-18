create or replace function expense_bank_details(p_claim_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_c expense_claim%rowtype; v_secret text;
begin
  if not is_expense_approver() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_c from expense_claim where id = p_claim_id;
  if not found then raise exception 'claim_not_found' using errcode = 'P0002'; end if;
  if v_c.bank_secret_id is null then return null; end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where id = v_c.bank_secret_id;
  perform log_audit('expense.bank_view', 'expense_claim', p_claim_id::text, null, null);
  return v_secret::jsonb;
end $$;

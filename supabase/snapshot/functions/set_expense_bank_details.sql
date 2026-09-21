create or replace function set_expense_bank_details(p_claim_id uuid, p_iban text, p_bic text DEFAULT NULL::text, p_holder text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_c expense_claim%rowtype; v_sp speaker_profile%rowtype; v_me uuid := current_person_id(); v_iban text; v_bic text; v_holder text; v_secret text; v_sid uuid;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_c from expense_claim where id = p_claim_id for update;
  if not found then raise exception 'claim_not_found' using errcode = 'P0002'; end if;
  select * into v_sp from speaker_profile where id = v_c.profile_id;
  if v_sp.person_id <> v_me then raise exception 'not allowed' using errcode = '42501', detail = 'speaker_only'; end if;
  if v_c.status not in ('draft', 'rejected') then raise exception 'not_editable' using errcode = 'P0001', detail = v_c.status; end if;
  v_iban := upper(regexp_replace(coalesce(p_iban, ''), '\s', '', 'g'));
  if not iban_valid(v_iban) then raise exception 'invalid_iban' using errcode = '22023'; end if;
  v_bic := nullif(upper(regexp_replace(coalesce(p_bic, ''), '\s', '', 'g')), '');
  if v_bic is not null and v_bic !~ '^[A-Z0-9]{8}([A-Z0-9]{3})?$' then raise exception 'invalid_bic' using errcode = '22023'; end if;
  v_holder := nullif(btrim(coalesce(p_holder, '')), '');
  if v_holder is null or length(v_holder) < 2 then raise exception 'holder_required' using errcode = '22023'; end if;
  v_secret := jsonb_build_object('iban', v_iban, 'bic', v_bic, 'holder', v_holder)::text;
  if v_c.bank_secret_id is null then
    v_sid := vault.create_secret(v_secret, 'expense_bank:' || p_claim_id::text, 'Bankdaten Reisekostenantrag ' || p_claim_id::text);
  else
    perform vault.update_secret(v_c.bank_secret_id, v_secret);
    v_sid := v_c.bank_secret_id;
  end if;
  update expense_claim set bank_secret_id = v_sid, bank_masked = substr(v_iban, 1, 2) || '****' || right(v_iban, 4), bank_holder = v_holder where id = p_claim_id;
  perform log_audit('expense.bank_set', 'expense_claim', p_claim_id::text, null, jsonb_build_object('masked', substr(v_iban, 1, 2) || '****' || right(v_iban, 4)));
end $$;

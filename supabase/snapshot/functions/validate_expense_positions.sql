create or replace function validate_expense_positions(p_positions jsonb, p_profile_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_sum integer := 0; x jsonb; v_amt integer; v_receipt uuid; v_n integer := 0;
begin
  if p_positions is null or jsonb_typeof(p_positions) <> 'array' then raise exception 'invalid_positions' using errcode = '22023'; end if;
  for x in select value from jsonb_array_elements(p_positions) loop
    v_n := v_n + 1;
    if jsonb_typeof(x) <> 'object' then raise exception 'invalid_positions' using errcode = '22023'; end if;
    v_amt := nullif(x->>'amount_cents', '')::integer;
    if v_amt is null or v_amt <= 0 or v_amt > 500000 then raise exception 'invalid_amount' using errcode = '22023', detail = 'position ' || v_n::text; end if;
    if not is_vocab_key('expense_category', coalesce(x->>'category', '')) then raise exception 'invalid_category' using errcode = '22023', detail = coalesce(x->>'category', ''); end if;
    if nullif(x->>'date', '') is null then raise exception 'date_required' using errcode = '22023', detail = 'position ' || v_n::text; end if;
    perform (x->>'date')::date;
    if length(coalesce(x->>'description', '')) > 200 then raise exception 'description_too_long' using errcode = '22023'; end if;
    v_receipt := nullif(x->>'receipt_asset_id', '')::uuid;
    if v_receipt is not null and not exists (select 1 from speaker_asset a where a.id = v_receipt and a.profile_id = p_profile_id and a.kind = 'receipt') then
      raise exception 'receipt_not_found' using errcode = 'P0002';
    end if;
    v_sum := v_sum + v_amt;
  end loop;
  if v_n > 50 then raise exception 'too_many_positions' using errcode = '22023'; end if;
  return v_sum;
end $$;

create or replace function upsert_expense_claim(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_sp speaker_profile%rowtype; v_me uuid := current_person_id(); v_id uuid := nullif(p_data->>'id', '')::uuid; v_c expense_claim%rowtype; v_sum integer; v_elig jsonb;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_sp from speaker_profile where id = my_speaker_profile_id(null);
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  v_elig := expense_eligibility(v_sp.id);
  if not (v_elig->>'eligible')::boolean then raise exception 'not_eligible' using errcode = 'P0001', detail = v_elig->>'reason'; end if;
  if not (p_data ? 'positions') then raise exception 'positions_required' using errcode = '22023'; end if;

  if v_sp.expense_mode = 'lump_sum' then
    -- Die Pauschale steht fest; Positionen wären eine zweite Rechnung daneben.
    -- Ein leeres Feld bleibt erlaubt, weil der Antrag die Bankverbindung trägt.
    if jsonb_array_length(coalesce(p_data->'positions', '[]'::jsonb)) > 0 then
      raise exception 'lump_sum_no_positions' using errcode = '22023';
    end if;
    v_sum := coalesce(v_sp.expense_lump_sum_cents, 0);
  else
    v_sum := validate_expense_positions(p_data->'positions', v_sp.id);
  end if;

  if v_id is null then
    select * into v_c from expense_claim where profile_id = v_sp.id and status in ('draft', 'rejected') order by created_at desc limit 1 for update;
    if found then v_id := v_c.id; end if;
  else
    select * into v_c from expense_claim where id = v_id and profile_id = v_sp.id for update;
    if not found then raise exception 'claim_not_found' using errcode = 'P0002'; end if;
    if v_c.status not in ('draft', 'rejected') then raise exception 'not_editable' using errcode = 'P0001', detail = v_c.status; end if;
  end if;
  if v_id is null then
    insert into expense_claim (profile_id, positions, amount_cents) values (v_sp.id, p_data->'positions', v_sum) returning id into v_id;
  else
    update expense_claim set positions = p_data->'positions', amount_cents = v_sum, status = 'draft', review_note = null where id = v_id;
  end if;
  perform log_audit('expense.upsert', 'expense_claim', v_id::text, null, jsonb_build_object('positions', jsonb_array_length(p_data->'positions'), 'amount_cents', v_sum, 'by_assistant', v_sp.person_id <> v_me));
  return v_id;
end $$;

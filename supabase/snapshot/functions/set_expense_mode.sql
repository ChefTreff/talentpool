create or replace function set_expense_mode(p_profile_id uuid, p_mode text, p_amount_cents integer DEFAULT NULL::integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_sp speaker_profile%rowtype;
begin
  select * into v_sp from speaker_profile where id = p_profile_id;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;

  -- Das Speaker-Team oder die betreuende Person („Stage Lead", Konrad 22.09.).
  -- `coalesce`, weil `can_manage_speaker` für Fremde NULL liefern kann und
  -- `if not NULL` dann nicht auslöst (Lehre aus 0118).
  if not coalesce(is_speaker_team(null) or can_manage_speaker(p_profile_id), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if not is_vocab_key('expense_mode', p_mode) then
    raise exception 'invalid_expense_mode' using errcode = '22023', detail = coalesce(p_mode, 'null');
  end if;
  if p_mode = 'lump_sum' and (p_amount_cents is null or p_amount_cents < 0) then
    raise exception 'lump_sum_amount_required' using errcode = '22023';
  end if;

  update speaker_profile
     set expense_mode = p_mode,
         expense_lump_sum_cents = case when p_mode = 'lump_sum' then p_amount_cents else null end
   where id = p_profile_id;

  perform log_audit('speaker.expense_mode', 'speaker_profile', p_profile_id::text,
    jsonb_build_object('mode', v_sp.expense_mode, 'amount_cents', v_sp.expense_lump_sum_cents),
    jsonb_build_object('mode', p_mode, 'amount_cents',
                       case when p_mode = 'lump_sum' then p_amount_cents else null end));
end $$;

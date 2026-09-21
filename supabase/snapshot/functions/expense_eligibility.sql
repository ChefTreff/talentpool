create or replace function expense_eligibility(p_profile_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_sp speaker_profile%rowtype; v_me uuid := current_person_id(); v_reason text;
begin
  select * into v_sp from speaker_profile where id = coalesce(p_profile_id, my_speaker_profile_id(null));
  if not found then return null; end if;
  if not coalesce((v_sp.person_id = v_me or v_sp.assistant_person_id = v_me or can_manage_speaker(v_sp.id) or is_expense_approver()), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_reason := case when not v_sp.travel_costs_covered then 'not_covered' when v_sp.travel_costs_approved_at is null then 'not_approved' end;
  return jsonb_build_object('eligible', v_reason is null, 'reason', v_reason, 'covered', v_sp.travel_costs_covered,
                            'approved', v_sp.travel_costs_approved_at is not null, 'is_assistant', v_sp.person_id <> v_me,
                            'open_claim', (select c.id from expense_claim c where c.profile_id = v_sp.id and c.status in ('draft', 'submitted', 'approved', 'rejected') order by c.created_at desc limit 1));
end $$;

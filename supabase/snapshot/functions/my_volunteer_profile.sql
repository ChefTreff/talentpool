create or replace function my_volunteer_profile(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_pid uuid := current_person_id(); v_ed uuid; v_p volunteer_profile; v_shop text;
begin
  if v_pid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_ed := volunteer_edition(p_edition_id);
  select * into v_p from volunteer_profile where person_id = v_pid and edition_id = v_ed;
  if not found then return null; end if;
  select e.vivenu_volunteer_undershop_id into v_shop from event e where e.id = v_ed;
  return jsonb_build_object(
    'id', v_p.id, 'edition_id', v_p.edition_id, 'status', v_p.status, 'shirt_size', v_p.shirt_size,
    'areas', to_jsonb(v_p.areas), 'day_prefs', to_jsonb(v_p.day_prefs), 'availability', v_p.availability,
    'buddy_person_id', v_p.buddy_person_id, 'buddy_note', v_p.buddy_note,
    'applied_at', v_p.applied_at, 'decided_at', v_p.decided_at, 'decision_note', v_p.decision_note,
    'shifts', (select count(*) from shift_assignment a where a.person_id = v_pid and a.status in ('assigned', 'confirmed')),
    -- Ticket: nur was die Person braucht. `coupon_error` bleibt drin — das ist
    -- unsere Panne, nicht ihre.
    'coupon_status', v_p.coupon_status,
    'coupon_code', case when v_p.coupon_status in ('issued', 'redeemed') then v_p.coupon_code end,
    'redeemed_at', v_p.redeemed_at,
    'undershop_id', case when v_p.coupon_status = 'issued' then v_shop end);
end $$;

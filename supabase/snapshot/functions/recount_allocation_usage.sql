create or replace function recount_allocation_usage(p_allocation_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_a org_ticket_allocation; v_n integer;
begin
  select * into v_a from org_ticket_allocation where id = p_allocation_id;
  if not found then return 0; end if;
  -- Undershop + Pass-Typ ist der verlässliche Schlüssel; der Coupon bleibt als
  -- zweiter Weg, falls ein Ticket ohne Undershop kommt (Freitickets, POS).
  select count(*)::integer into v_n from ticket t
   where t.status in ('valid', 'approved', 'checked_in', 'blocked')
     and t.event_id = v_a.event_id
     and ((v_a.vivenu_undershop_id is not null
           and t.vivenu_undershop_id = v_a.vivenu_undershop_id
           and t.pass_type is not distinct from v_a.pass_type)
       or (v_a.vivenu_coupon_id is not null and t.vivenu_discount_id = v_a.vivenu_coupon_id));
  update org_ticket_allocation set used_count = v_n where id = p_allocation_id;
  return v_n;
end $$;

create or replace function my_ticket_allocations(p_org_id uuid, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, pass_type text, quantity integer, used_count integer, coupon_code text, undershop_url text, status text, codes_due_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_oe org_edition;
begin
  if not (is_partner_of(p_org_id) or is_partner_team()) then raise exception 'not allowed' using errcode = '42501'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then return; end if;
  return query
    select a.id, a.pass_type, a.quantity, a.used_count,
           case when a.status = 'active' then a.coupon_code end, case when a.status = 'active' then a.undershop_url end,
           a.status, (select d.due_at from deadline d where d.edition_id = v_oe.edition_id and d.key = 'ticket_codes')
    from org_ticket_allocation a
    where a.org_id = p_org_id and a.event_id = v_oe.edition_id and a.status <> 'disabled'
    order by a.pass_type;
end $$;

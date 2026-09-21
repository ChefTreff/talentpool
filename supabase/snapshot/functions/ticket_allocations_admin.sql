create or replace function ticket_allocations_admin(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, org_id uuid, org_name text, org_edition_id uuid, edition_id uuid, pass_type text, discount_percent integer, quantity integer, used_count integer, coupon_code text, undershop_url text, status text, last_error text, synced_at timestamp with time zone, notes text, vivenu_coupon_id text, vivenu_undershop_id text, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select a.id, a.org_id, coalesce(o.communication_name, o.legal_name), a.org_edition_id, a.event_id, a.pass_type,
           a.discount_percent, a.quantity, a.used_count, a.coupon_code, a.undershop_url, a.status,
           a.last_error, a.synced_at, a.notes, a.vivenu_coupon_id, a.vivenu_undershop_id, a.updated_at
    from org_ticket_allocation a join organization o on o.id = a.org_id
    where p_edition_id is null or a.event_id = p_edition_id
    order by case a.status when 'error' then 0 when 'pending_vivenu' then 1 when 'active' then 2 else 3 end,
             coalesce(o.communication_name, o.legal_name), a.pass_type, a.discount_percent desc;
end $$;

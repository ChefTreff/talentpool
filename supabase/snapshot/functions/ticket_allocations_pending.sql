create or replace function ticket_allocations_pending()
 RETURNS TABLE(id uuid, org_id uuid, org_name text, org_slug text, edition_id uuid, edition_slug text, vivenu_event_id text, pass_type text, quantity integer, status text, coupon_code text, vivenu_coupon_id text, vivenu_undershop_id text, org_undershop_id text, ticket_type_ids text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if auth.uid() is not null and not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select a.id, a.org_id, coalesce(o.communication_name, o.legal_name), o.slug, a.event_id, e.slug, e.vivenu_event_id, a.pass_type, a.quantity, a.status,
           a.coupon_code, a.vivenu_coupon_id, a.vivenu_undershop_id,
           (select b.vivenu_undershop_id from org_ticket_allocation b where b.org_id = a.org_id and b.event_id = a.event_id and b.vivenu_undershop_id is not null limit 1),
           coalesce((select array_agg(m.vivenu_ticket_type_id order by m.vivenu_ticket_type_id) from ticket_type_map m
                     where m.active and m.pass_type = a.pass_type and m.event_id in (select ev.id from event ev where ev.id = a.event_id or ev.edition_id = a.event_id)), '{}'::text[])
    from org_ticket_allocation a join organization o on o.id = a.org_id join event e on e.id = a.event_id
    where e.vivenu_event_id is not null and (a.status in ('pending_vivenu', 'error') or a.synced_at is null)
    order by e.vivenu_event_id, o.id, a.pass_type;
end $$;

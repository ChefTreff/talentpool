create or replace function partner_admin_overview(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(org_id uuid, communication_name text, legal_name text, org_type text, edition_id uuid, onboarding_status text, invited_at timestamp with time zone, onboarding_filled_at timestamp with time zone, contacts integer, primary_email text, products integer, invoice_email text, hubspot_deal_id text, updated_at timestamp with time zone, deliverables_open integer, deliverables_submitted integer, deliverables_overdue integer, booth_number text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select o.id, coalesce(o.communication_name, o.legal_name), o.legal_name, o.type, oe.edition_id, oe.onboarding_status, oe.invited_at, oe.onboarding_filled_at,
           (select count(*)::integer from org_membership om where om.org_id = o.id),
           (select pe.email::text from org_membership om join person_email pe on pe.person_id = om.person_id and pe.is_primary where om.org_id = o.id and om.roles @> '{primary_ops}' limit 1),
           (select count(*)::integer from org_product op where op.org_edition_id = oe.id and op.status = 'booked'),
           oe.invoice_email::text, oe.hubspot_deal_id, oe.updated_at,
           (select count(*)::integer from deliverable d where d.org_edition_id = oe.id and d.status in ('open', 'rejected')),
           (select count(*)::integer from deliverable d where d.org_edition_id = oe.id and d.status = 'submitted'),
           (select count(*)::integer from deliverable d where d.org_edition_id = oe.id and d.status = 'overdue'),
           (select b.booth_number from booth_assignment ba join booth b on b.id = ba.booth_id
            where ba.org_edition_id = oe.id order by ba.event_day_id nulls first, b.created_at limit 1)
    from org_edition oe join organization o on o.id = oe.org_id
    where (p_edition_id is null or oe.edition_id = p_edition_id)
    order by oe.onboarding_status, coalesce(o.communication_name, o.legal_name);
end $$;

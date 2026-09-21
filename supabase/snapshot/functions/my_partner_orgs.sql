create or replace function my_partner_orgs()
 RETURNS TABLE(org_id uuid, communication_name text, legal_name text, org_type text, roles text[], edition_id uuid, edition_name text, edition_slug text, onboarding_status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  return query
    select o.id, coalesce(o.communication_name, o.legal_name), o.legal_name, o.type, om.roles,
           oe.edition_id, e.name, e.slug, oe.onboarding_status
    from org_membership om
    join organization o on o.id = om.org_id
    left join lateral (select * from current_org_edition(om.org_id, null)) oe on true
    left join event e on e.id = oe.edition_id
    where om.person_id = current_person_id() and has_role('partner_contact', 'org', om.org_id) and o.active
    order by coalesce(o.communication_name, o.legal_name);
end $$;

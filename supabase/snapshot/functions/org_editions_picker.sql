create or replace function org_editions_picker(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(org_edition_id uuid, org_id uuid, org_name text, org_type text, onboarding_status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid;
begin
  if not (is_partner_team() or is_production_team()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition
                                  order by e.start_date desc limit 1)) into v_ed;
  return query
    select oe.id, o.id, coalesce(nullif(btrim(o.communication_name), ''), o.legal_name), o.type, oe.onboarding_status
      from org_edition oe
      join organization o on o.id = oe.org_id
     where oe.edition_id = v_ed and o.active
     order by coalesce(nullif(btrim(o.communication_name), ''), o.legal_name);
end $$;

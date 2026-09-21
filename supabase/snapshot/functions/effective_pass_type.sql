create or replace function effective_pass_type(p_product_pass_type text, p_org_edition_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select case when p_product_pass_type = 'talent'
              then coalesce(oe.pass_type_choice, case when o.type = 'startup' then 'startup' else 'talent' end)
              else p_product_pass_type end
  from org_edition oe join organization o on o.id = oe.org_id where oe.id = p_org_edition_id
$$;

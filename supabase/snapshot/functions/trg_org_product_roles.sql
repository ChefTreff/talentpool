create or replace function trg_org_product_roles()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_org uuid;
begin
  select oe.org_id into v_org from org_edition oe where oe.id = coalesce(new.org_edition_id, old.org_edition_id);
  if v_org is not null then perform sync_granted_roles(v_org); end if;
  return coalesce(new, old);
end $$;

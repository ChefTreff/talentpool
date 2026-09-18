create or replace function partner_onboarding_recheck(p_org_edition_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_oe org_edition; v_o organization%rowtype;
begin
  select * into v_oe from org_edition where id = p_org_edition_id;
  if not found then return null; end if;
  select * into v_o from organization where id = v_oe.org_id;
  if v_oe.onboarding_status in ('none', 'invited')
     and coalesce(v_o.legal_name, '') <> '' and coalesce(v_o.communication_name, '') <> '' and coalesce(v_o.address_street, '') <> ''
     and coalesce(v_o.address_zip, '') <> '' and coalesce(v_o.address_city, '') <> '' and v_oe.invoice_email is not null and coalesce(v_o.description_de, '') <> ''
     and exists (select 1 from partner_asset a where a.org_edition_id = v_oe.id and a.kind = 'logo_vector' and a.is_current)
     and exists (select 1 from partner_asset a where a.org_edition_id = v_oe.id and a.kind = 'logo_png' and a.is_current) then
    update org_edition set onboarding_status = 'filled', onboarding_filled_at = now() where id = v_oe.id;
    return 'filled';
  end if;
  return v_oe.onboarding_status;
end $$;

create or replace function update_partner_onboarding(p_org_id uuid, p_data jsonb, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_oe org_edition; v_status text;
begin
  if not partner_can_edit(p_org_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then raise exception 'org_edition_not_found' using errcode = 'P0002'; end if;
  if p_data ? 'pass_type_choice' and nullif(p_data->>'pass_type_choice', '') is not null and (p_data->>'pass_type_choice') not in ('talent', 'startup') then
    raise exception 'invalid_pass_type' using errcode = '22023';
  end if;
  if p_data ? 'invoice_email' and nullif(p_data->>'invoice_email', '') is not null and (p_data->>'invoice_email') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  update organization set
    legal_name         = case when p_data ? 'legal_name' then nullif(btrim(p_data->>'legal_name'), '') else legal_name end,
    communication_name = case when p_data ? 'communication_name' then nullif(btrim(p_data->>'communication_name'), '') else communication_name end,
    address_street     = case when p_data ? 'address_street' then nullif(btrim(p_data->>'address_street'), '') else address_street end,
    address_zip        = case when p_data ? 'address_zip' then nullif(btrim(p_data->>'address_zip'), '') else address_zip end,
    address_city       = case when p_data ? 'address_city' then nullif(btrim(p_data->>'address_city'), '') else address_city end,
    address_country    = case when p_data ? 'address_country' then nullif(btrim(p_data->>'address_country'), '') else address_country end,
    website            = case when p_data ? 'website' then nullif(btrim(p_data->>'website'), '') else website end,
    description_de     = case when p_data ? 'description_de' then nullif(btrim(p_data->>'description_de'), '') else description_de end,
    description_en     = case when p_data ? 'description_en' then nullif(btrim(p_data->>'description_en'), '') else description_en end
  where id = p_org_id;
  update org_edition set
    invoice_email    = case when p_data ? 'invoice_email' then nullif(lower(btrim(p_data->>'invoice_email')), '')::citext else invoice_email end,
    invoice_name     = case when p_data ? 'invoice_name' then nullif(btrim(p_data->>'invoice_name'), '') else invoice_name end,
    vat_id           = case when p_data ? 'vat_id' then nullif(btrim(p_data->>'vat_id'), '') else vat_id end,
    po_number        = case when p_data ? 'po_number' then nullif(btrim(p_data->>'po_number'), '') else po_number end,
    pass_type_choice = case when p_data ? 'pass_type_choice' then nullif(p_data->>'pass_type_choice', '') else pass_type_choice end
  where id = v_oe.id;
  v_status := partner_onboarding_recheck(v_oe.id);
  perform log_audit('partner.onboarding', 'organization', p_org_id::text, null, jsonb_build_object('fields', (select jsonb_agg(k) from jsonb_object_keys(p_data) k), 'status', v_status));
  return jsonb_build_object('onboarding_status', v_status);
end $$;

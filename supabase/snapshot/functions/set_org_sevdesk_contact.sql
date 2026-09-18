create or replace function set_org_sevdesk_contact(p_org_id uuid, p_contact_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not (auth.uid() is null or is_partner_team()) then raise exception 'not allowed' using errcode = '42501'; end if;
  update organization set sevdesk_contact_id = nullif(btrim(coalesce(p_contact_id, '')), '') where id = p_org_id;
  if not found then raise exception 'org_not_found' using errcode = 'P0002'; end if;
  perform log_audit('org.sevdesk_contact', 'organization', p_org_id::text, null, jsonb_build_object('contact_id', p_contact_id));
end $$;

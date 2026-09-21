create or replace function upsert_partner_contact(p_org_id uuid, p_email text, p_first_name text, p_last_name text, p_roles text[], p_position text DEFAULT NULL::text, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_oe org_edition; v_pid uuid; v_new boolean;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not partner_can_manage_contacts(p_org_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then raise exception 'org_edition_not_found' using errcode = 'P0002'; end if;
  v_new := not exists (select 1 from org_membership om join person_email pe on pe.person_id = om.person_id
                       where om.org_id = p_org_id and pe.email = lower(btrim(coalesce(p_email, '')))::citext);
  v_pid := partner_contact_upsert_internal(p_org_id, p_email, p_first_name, p_last_name, p_roles, p_position, v_oe.edition_id, v_me, 'partner_portal');
  perform log_audit('partner.contact_upsert', 'organization', p_org_id::text, null, jsonb_build_object('person_id', v_pid, 'roles', to_jsonb(p_roles), 'new', v_new));
  return v_pid;
end $$;

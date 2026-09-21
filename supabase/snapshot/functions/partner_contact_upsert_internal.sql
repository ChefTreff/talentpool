create or replace function partner_contact_upsert_internal(p_org_id uuid, p_email text, p_first_name text, p_last_name text, p_roles text[], p_position text, p_edition_id uuid, p_actor uuid, p_source text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_email citext; v_pid uuid; v_mid uuid; v_role text; v_org_name text; v_new boolean := false;
begin
  if p_roles is null or cardinality(p_roles) = 0 then raise exception 'roles_required' using errcode = '22023'; end if;
  foreach v_role in array p_roles loop
    if not is_vocab_key('contact_role', v_role) then raise exception 'invalid_role' using errcode = '22023', detail = v_role; end if;
  end loop;
  v_email := lower(btrim(coalesce(p_email, '')))::citext;
  if v_email::text !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_email' using errcode = '22023'; end if;
  if is_suppressed(v_email::text) then raise exception 'suppressed' using errcode = 'P0001'; end if;
  select pe.person_id into v_pid from person_email pe join person p on p.id = pe.person_id where pe.email = v_email and p.deleted_at is null limit 1;
  if v_pid is null then
    insert into person (first_name, last_name, source_first, tier)
    values (nullif(btrim(coalesce(p_first_name, '')), ''), nullif(btrim(coalesce(p_last_name, '')), ''), coalesce(p_source, 'partner_portal'), 'lead') returning id into v_pid;
    insert into person_email (person_id, email, is_primary, verified) values (v_pid, v_email, true, false);
  end if;
  if 'primary_ops' = any(p_roles) and exists (select 1 from org_membership om where om.org_id = p_org_id and om.person_id <> v_pid and om.roles @> '{primary_ops}') then
    raise exception 'primary_exists' using errcode = 'P0001';
  end if;
  select id into v_mid from org_membership where org_id = p_org_id and person_id = v_pid;
  if v_mid is null then
    insert into org_membership (person_id, org_id, roles, contact_position, invited_at)
    values (v_pid, p_org_id, p_roles, nullif(btrim(coalesce(p_position, '')), ''), now()) returning id into v_mid;
    v_new := true;
  else
    update org_membership set roles = p_roles, contact_position = coalesce(nullif(btrim(coalesce(p_position, '')), ''), contact_position) where id = v_mid;
  end if;
  if not exists (select 1 from role_assignment ra where ra.person_id = v_pid and ra.role = 'partner_contact' and ra.scope_type = 'org' and ra.scope_id = p_org_id
                   and (ra.valid_to is null or ra.valid_to > now())) then
    insert into role_assignment (person_id, role, scope_type, scope_id, edition_id, valid_to, granted_by, note)
    values (v_pid, 'partner_contact', 'org', p_org_id, p_edition_id, edition_valid_to(p_edition_id), p_actor, coalesce(p_source, 'partner_portal'));
  end if;
  if v_new then
    select coalesce(o.communication_name, o.legal_name) into v_org_name from organization o where o.id = p_org_id;
    perform queue_mail('partner_contact_invite', v_pid, jsonb_build_object('org_name', v_org_name), 'org_membership', v_mid);
  end if;
  return v_pid;
end $$;

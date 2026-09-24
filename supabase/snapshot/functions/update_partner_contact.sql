create or replace function update_partner_contact(p_org_id uuid, p_person_id uuid, p_position text, p_first_name text DEFAULT NULL::text, p_last_name text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_roles text[] DEFAULT NULL::text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_me uuid := current_person_id(); v_om org_membership; v_p person; v_alt citext; v_neu citext;
  v_first text; v_last text; v_pos text; v_felder text[] := '{}'; v_org_name text; v_n integer;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not partner_can_manage_contacts(p_org_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_om from org_membership where org_id = p_org_id and person_id = p_person_id for update;
  if not found then raise exception 'contact_not_found' using errcode = 'P0002'; end if;
  select * into v_p from person where id = p_person_id and deleted_at is null for update;
  if not found then raise exception 'contact_not_found' using errcode = 'P0002'; end if;
  v_pos := nullif(btrim(coalesce(p_position, '')), '');
  if v_pos is null then raise exception 'position_required' using errcode = '22023'; end if;
  select pe.email into v_alt from person_email pe where pe.person_id = p_person_id and pe.is_primary limit 1;

  v_first := case when p_first_name is null then v_p.first_name else nullif(btrim(p_first_name), '') end;
  v_last  := case when p_last_name  is null then v_p.last_name  else nullif(btrim(p_last_name), '')  end;
  v_neu   := case when p_email      is null then v_alt          else lower(btrim(p_email))::citext  end;
  if v_first is distinct from v_p.first_name then v_felder := array_append(v_felder, 'first_name'); end if;
  if v_last  is distinct from v_p.last_name  then v_felder := array_append(v_felder, 'last_name');  end if;
  if v_neu   is distinct from v_alt          then v_felder := array_append(v_felder, 'email');      end if;

  -- Name und Adresse gehören der Person: nur bei selbst angelegten und nur bis zum ersten Login.
  if cardinality(v_felder) > 0 then
    if not (v_om.partner_editable_until_login and v_p.auth_user_id is null) then
      raise exception 'contact_not_editable' using errcode = 'P0001';
    end if;
    if v_first is null or v_last is null then raise exception 'name_required' using errcode = '22023'; end if;
  end if;
  if 'email' = any(v_felder) then
    if v_neu is null or v_neu::text !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_email' using errcode = '22023'; end if;
    if is_suppressed(v_neu::text) then raise exception 'suppressed' using errcode = 'P0001'; end if;
    if exists (select 1 from person_email pe where pe.email = v_neu and pe.person_id <> p_person_id) then
      raise exception 'email_in_use' using errcode = 'P0001';
    end if;
  end if;

  if 'first_name' = any(v_felder) or 'last_name' = any(v_felder) then
    update person set first_name = v_first, last_name = v_last where id = p_person_id;
  end if;
  if 'email' = any(v_felder) then
    update person_email set email = v_neu, verified = false where person_id = p_person_id and is_primary;
    if not found then
      insert into person_email (person_id, email, is_primary, verified) values (p_person_id, v_neu, true, false);
    end if;
  end if;
  if v_pos is distinct from v_om.contact_position then
    update org_membership set contact_position = v_pos where id = v_om.id;
    v_felder := array_append(v_felder, 'position');
  end if;

  -- Die Einladung soll zur korrigierten Adresse gehen und den richtigen Vornamen tragen: eine
  -- wartende zieht um, eine schon verschickte wird neu gestellt.
  if 'email' = any(v_felder) or 'first_name' = any(v_felder) then
    update mail_log
       set to_email = coalesce(v_neu, to_email),
           meta = jsonb_set(coalesce(meta, '{}'::jsonb), '{vars,first_name}', to_jsonb(coalesce(v_first, ''))),
           updated_at = now()
     where template_key = 'partner_contact_invite' and person_id = p_person_id and related_id = v_om.id and status = 'queued';
    get diagnostics v_n = row_count;
    if v_n = 0 and 'email' = any(v_felder) then
      select coalesce(o.communication_name, o.legal_name) into v_org_name from organization o where o.id = p_org_id;
      perform queue_mail('partner_contact_invite', p_person_id, jsonb_build_object('org_name', v_org_name), 'org_membership', v_om.id);
      update org_membership set invited_at = now() where id = v_om.id;
    end if;
  end if;

  if p_roles is not null
     and (select coalesce(array_agg(x order by x), '{}') from unnest(p_roles) x)
         is distinct from (select coalesce(array_agg(x order by x), '{}') from unnest(v_om.roles) x) then
    perform set_contact_roles(p_org_id, p_person_id, p_roles);
  end if;

  -- Welche Felder, nicht welche Werte: die Adresse gehört nicht ins Audit.
  if cardinality(v_felder) > 0 then
    perform log_audit('partner.contact_update', 'organization', p_org_id::text,
                      jsonb_build_object('person_id', p_person_id),
                      jsonb_build_object('person_id', p_person_id, 'fields', to_jsonb(v_felder)));
  end if;
end $$;

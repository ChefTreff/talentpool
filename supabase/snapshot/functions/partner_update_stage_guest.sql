create or replace function partner_update_stage_guest(p_profile_id uuid, p_first_name text DEFAULT NULL::text, p_last_name text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_job_title text DEFAULT NULL::text, p_organization text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_sp speaker_profile; v_p person; v_alt citext; v_neu citext; v_first text; v_last text;
        v_felder text[] := '{}';
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_sp from speaker_profile where id = p_profile_id for update;
  if not found or not v_sp.stage_guest then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not partner_can_edit(v_sp.created_by_org_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_p from person where id = v_sp.person_id for update;

  if p_job_title is not null or p_organization is not null then
    if (p_job_title is not null and nullif(btrim(p_job_title), '') is null)
       or (p_organization is not null and nullif(btrim(p_organization), '') is null) then
      raise exception 'fields_required' using errcode = '22023',
        detail = concat_ws(', ', case when p_job_title is not null and nullif(btrim(p_job_title), '') is null then 'job_title' end,
                                 case when p_organization is not null and nullif(btrim(p_organization), '') is null then 'organization_name' end);
    end if;
    update speaker_profile
       set job_title = coalesce(nullif(btrim(p_job_title), ''), job_title),
           organization_name = coalesce(nullif(btrim(p_organization), ''), organization_name)
     where id = v_sp.id;
    v_felder := v_felder || array_remove(array[case when p_job_title is not null then 'job_title' end,
                                               case when p_organization is not null then 'organization_name' end], null);
  end if;

  select pe.email into v_alt from person_email pe where pe.person_id = v_p.id and pe.is_primary limit 1;
  v_first := case when p_first_name is null then v_p.first_name else nullif(btrim(p_first_name), '') end;
  v_last  := case when p_last_name  is null then v_p.last_name  else nullif(btrim(p_last_name), '')  end;
  v_neu   := case when p_email      is null then v_alt          else nullif(lower(btrim(p_email)), '')::citext end;
  if v_first is distinct from v_p.first_name or v_last is distinct from v_p.last_name or v_neu is distinct from v_alt then
    -- Name und Adresse gehören der Person: nur bei selbst angelegten und nur bis zum ersten Login.
    if not (v_sp.partner_editable_until_login and v_p.auth_user_id is null) then
      raise exception 'speaker_not_editable' using errcode = 'P0001';
    end if;
    if v_first is null or v_last is null then raise exception 'name_required' using errcode = '22023'; end if;
    if v_neu is distinct from v_alt then
      if v_neu is null or v_neu::text !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_email' using errcode = '22023'; end if;
      if is_suppressed(v_neu::text) then raise exception 'suppressed' using errcode = 'P0001'; end if;
      if exists (select 1 from person_email pe where pe.email = v_neu and pe.person_id <> v_p.id) then
        raise exception 'email_in_use' using errcode = 'P0001';
      end if;
      update person_email set email = v_neu, verified = false where person_id = v_p.id and is_primary;
      if not found then
        insert into person_email (person_id, email, is_primary, verified) values (v_p.id, v_neu, true, false);
      end if;
      v_felder := array_append(v_felder, 'email');
    end if;
    if v_first is distinct from v_p.first_name or v_last is distinct from v_p.last_name then
      update person set first_name = v_first, last_name = v_last where id = v_p.id;
      v_felder := array_append(v_felder, 'name');
    end if;
  end if;

  -- Welche Felder, nicht welche Werte: die Adresse gehört nicht ins Audit.
  if cardinality(v_felder) > 0 then
    perform log_audit('partner.stage_guest_update', 'speaker_profile', v_sp.id::text, null,
                      jsonb_build_object('org_id', v_sp.created_by_org_id, 'fields', v_felder));
  end if;
end $$;

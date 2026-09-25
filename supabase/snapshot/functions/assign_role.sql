create or replace function assign_role(p_person_id uuid, p_role text, p_scope_type text, p_scope_id uuid DEFAULT NULL::uuid, p_edition_id uuid DEFAULT NULL::uuid, p_portal text DEFAULT NULL::text, p_valid_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_valid_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_id uuid; v_actor uuid := current_person_id(); v_edition uuid := p_edition_id;
begin
  if not has_role('admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from vocab_term where vocabulary = 'role' and key = p_role and active) then
    raise exception 'invalid_role' using errcode = '22023', detail = p_role;
  end if;
  if not exists (select 1 from person where id = p_person_id and deleted_at is null) then
    raise exception 'person_not_found' using errcode = 'P0002';
  end if;
  -- PORT3 / L7: `speaker_manager` sind die externen Stage Leads — nur für eine
  -- Bühne, einen Tag einer Bühne oder einen Slot, nie für die Edition oder global.
  -- Die Edition folgt der Bühne.
  if p_role = 'speaker_manager' then
    if coalesce(p_scope_type, '') not in ('stage', 'stage_day', 'slot')
       or scope_stage_id(p_scope_type, p_scope_id) is null then
      raise exception 'stage_scope_required' using errcode = '22023', detail = coalesce(p_scope_type, 'null');
    end if;
    select coalesce(ev.edition_id, ev.id) into v_edition
      from stage st join event ev on ev.id = st.event_id
     where st.id = scope_stage_id(p_scope_type, p_scope_id);
  end if;
  insert into role_assignment (person_id, role, scope_type, scope_id, edition_id, portal, valid_from, valid_to, granted_by, note)
  values (p_person_id, p_role, p_scope_type, p_scope_id, v_edition, p_portal,
          coalesce(p_valid_from, now()), p_valid_to, v_actor, p_note)
  on conflict (person_id, role, scope_type,
               coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid),
               coalesce(edition_id, '00000000-0000-0000-0000-000000000000'::uuid),
               coalesce(portal, ''))
  do update set valid_from = coalesce(p_valid_from, now()), valid_to = p_valid_to,
                granted_by = v_actor, note = coalesce(p_note, role_assignment.note)
  returning id into v_id;
  perform log_audit('role.assign', 'role_assignment', v_id::text, null,
    jsonb_build_object('person_id', p_person_id, 'role', p_role, 'scope_type', p_scope_type,
                       'scope_id', p_scope_id, 'edition_id', v_edition, 'portal', p_portal,
                       'valid_from', coalesce(p_valid_from, now()), 'valid_to', p_valid_to));
  return v_id;
end $$;

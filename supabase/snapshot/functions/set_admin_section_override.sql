create or replace function set_admin_section_override(p_section text, p_allowed boolean, p_role text DEFAULT NULL::text, p_person_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_id uuid; v_vorher jsonb;
begin
  if not has_role('admin') then raise exception 'not allowed' using errcode = '42501'; end if;
  if nullif(btrim(coalesce(p_section, '')), '') is null then
    raise exception 'section_required' using errcode = '22023';
  end if;
  if (p_role is null) = (p_person_id is null) then
    raise exception 'invalid_target' using errcode = '22023',
      detail = 'entweder Rolle oder Person, nicht beides';
  end if;
  -- `admin` bleibt aussen vor: eine Ausnahme darauf wäre wirkungslos (siehe
  -- `my_admin_section_overrides`) und würde eine Sicherheit vortäuschen.
  if p_role = 'admin' then
    raise exception 'admin_not_overridable' using errcode = 'P0001',
      detail = 'Die Rolle admin sieht immer alles.';
  end if;
  if p_role is not null and not exists (
       select 1 from vocab_term where vocabulary = 'role' and key = p_role and active) then
    raise exception 'invalid_role' using errcode = '22023', detail = p_role;
  end if;
  if p_person_id is not null and not exists (
       select 1 from person where id = p_person_id and deleted_at is null) then
    raise exception 'person_not_found' using errcode = 'P0002', detail = p_person_id::text;
  end if;

  select to_jsonb(o) into v_vorher from admin_section_override o
   where o.section = p_section
     and o.role is not distinct from p_role
     and o.person_id is not distinct from p_person_id;

  insert into admin_section_override (section, role, person_id, allowed, note, created_by)
  values (btrim(p_section), p_role, p_person_id, p_allowed,
          nullif(btrim(coalesce(p_note, '')), ''), current_person_id())
  on conflict (section, coalesce(role, ''), coalesce(person_id, '00000000-0000-0000-0000-000000000000'::uuid))
  do update set allowed = excluded.allowed, note = excluded.note, updated_at = now()
  returning id into v_id;

  perform log_audit('admin_section.override', 'admin_section_override', v_id::text,
                    coalesce(v_vorher, 'null'::jsonb),
                    jsonb_build_object('section', p_section, 'role', p_role,
                                       'person_id', p_person_id, 'allowed', p_allowed));
  return v_id;
end $$;

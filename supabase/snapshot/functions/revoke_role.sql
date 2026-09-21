create or replace function revoke_role(p_assignment_id uuid, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ra role_assignment%rowtype;
begin
  if not has_role('admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_ra from role_assignment where id = p_assignment_id for update;
  if not found then
    raise exception 'assignment_not_found' using errcode = 'P0002';
  end if;
  if v_ra.role = 'admin' and v_ra.scope_type = 'global' and not exists (
       select 1 from role_assignment r
       where r.role = 'admin' and r.scope_type = 'global' and r.id <> v_ra.id
         and r.valid_from <= now() and (r.valid_to is null or r.valid_to > now())) then
    raise exception 'last_admin' using errcode = 'P0001';
  end if;
  update role_assignment
     set valid_to = greatest(now(), valid_from + interval '1 second'), note = coalesce(p_note, note)
   where id = p_assignment_id and (valid_to is null or valid_to > now());
  perform log_audit('role.revoke', 'role_assignment', p_assignment_id::text,
    jsonb_build_object('person_id', v_ra.person_id, 'role', v_ra.role, 'scope_type', v_ra.scope_type, 'scope_id', v_ra.scope_id),
    jsonb_build_object('valid_to', now()));
end $$;

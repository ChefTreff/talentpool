create or replace function set_person_access(p_person_id uuid, p_blocked boolean, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_alt timestamptz; v_name text;
begin
  if not has_admin_section('access') then raise exception 'not allowed' using errcode = '42501'; end if;
  -- **Nicht sich selbst.** Sonst nimmt man sich mit einem Klick den Zugang zu
  -- genau der Seite, auf der man ihn zuruecknimmt.
  if p_person_id = current_person_id() then
    raise exception 'cannot_block_self' using errcode = 'P0001';
  end if;
  select p.access_blocked_at, nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
    into v_alt, v_name from person p where p.id = p_person_id and p.deleted_at is null;
  if not found then raise exception 'person_not_found' using errcode = 'P0002', detail = p_person_id::text; end if;
  if (v_alt is not null) = coalesce(p_blocked, false) then return; end if;

  update person set access_blocked_at = case when p_blocked then now() else null end
   where id = p_person_id;
  perform log_audit(case when p_blocked then 'access.blocked' else 'access.unblocked' end,
                    'person', p_person_id::text,
                    jsonb_build_object('access_blocked_at', v_alt),
                    jsonb_build_object('access_blocked_at', case when p_blocked then now() else null end,
                                       'name', v_name,
                                       'note', nullif(btrim(coalesce(p_note, '')), '')));
end $$;

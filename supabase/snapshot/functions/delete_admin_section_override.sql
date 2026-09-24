create or replace function delete_admin_section_override(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_vorher jsonb;
begin
  if not has_role('admin') then raise exception 'not allowed' using errcode = '42501'; end if;
  select to_jsonb(o) into v_vorher from admin_section_override o where o.id = p_id;
  if v_vorher is null then
    raise exception 'override_not_found' using errcode = 'P0002', detail = coalesce(p_id::text, 'null');
  end if;
  delete from admin_section_override where id = p_id;
  perform log_audit('admin_section.override_removed', 'admin_section_override', p_id::text, v_vorher, null);
end $$;

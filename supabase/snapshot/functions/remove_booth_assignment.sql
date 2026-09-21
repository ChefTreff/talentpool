create or replace function remove_booth_assignment(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_before jsonb;
begin
  if not (is_partner_team() or is_production_team()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select to_jsonb(a) into v_before from booth_assignment a where a.id = p_id;
  if v_before is null then
    raise exception 'assignment_not_found' using errcode = 'P0002', detail = coalesce(p_id::text, 'null');
  end if;
  delete from booth_assignment where id = p_id;
  perform log_audit('booth.assignment_removed', 'booth', (v_before->>'booth_id'), v_before, null);
end $$;

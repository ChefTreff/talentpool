create or replace function delete_event_day(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_event uuid; v_n integer; v_before jsonb;
begin
  select ed.event_id, to_jsonb(ed) into v_event, v_before from event_day ed where ed.id = p_id;
  if v_event is null then raise exception 'day_not_found' using errcode = 'P0002'; end if;
  if not is_programme_editor(v_event) then raise exception 'not allowed' using errcode = '42501'; end if;

  select count(*)::integer into v_n from slot s where s.event_day_id = p_id;
  if v_n > 0 then raise exception 'in_use' using errcode = 'P0001', detail = 'slots:' || v_n; end if;
  select count(*)::integer into v_n from role_assignment ra
   where ra.scope_type = 'stage_day'
     and ra.scope_id in (select sd.id from stage_day sd where sd.event_day_id = p_id);
  if v_n > 0 then raise exception 'in_use' using errcode = 'P0001', detail = 'roles:' || v_n; end if;

  delete from event_day where id = p_id;
  perform log_audit('programme.day_delete', 'event_day', p_id::text, v_before, null);
end $$;

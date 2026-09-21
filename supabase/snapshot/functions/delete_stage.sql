create or replace function delete_stage(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_event uuid; v_n integer; v_before jsonb;
begin
  select st.event_id, to_jsonb(st) into v_event, v_before from stage st where st.id = p_id;
  if v_event is null then raise exception 'stage_not_found' using errcode = 'P0002'; end if;
  if not is_programme_editor(v_event) then raise exception 'not allowed' using errcode = '42501'; end if;

  select count(*)::integer into v_n from slot s where s.stage_id = p_id;
  if v_n > 0 then raise exception 'in_use' using errcode = 'P0001', detail = 'slots:' || v_n; end if;
  select count(*)::integer into v_n from role_assignment ra
   where (ra.scope_type = 'stage' and ra.scope_id = p_id)
      or (ra.scope_type = 'stage_day'
          and ra.scope_id in (select sd.id from stage_day sd where sd.stage_id = p_id));
  if v_n > 0 then raise exception 'in_use' using errcode = 'P0001', detail = 'roles:' || v_n; end if;

  delete from stage where id = p_id;
  perform log_audit('programme.stage_delete', 'stage', p_id::text, v_before, null);
end $$;

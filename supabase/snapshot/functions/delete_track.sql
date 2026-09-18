create or replace function delete_track(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_event uuid; v_n integer; v_before jsonb;
begin
  select t.event_id, to_jsonb(t) into v_event, v_before from track t where t.id = p_id;
  if v_event is null then raise exception 'track_not_found' using errcode = 'P0002'; end if;
  if not is_programme_editor(v_event) then raise exception 'not allowed' using errcode = '42501'; end if;
  select count(*)::integer into v_n from session se where se.track_id = p_id;
  if v_n > 0 then raise exception 'in_use' using errcode = 'P0001', detail = 'sessions:' || v_n; end if;
  delete from track where id = p_id;
  perform log_audit('programme.track_delete', 'track', p_id::text, v_before, null);
end $$;

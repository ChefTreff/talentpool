create or replace function delete_side_event(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid; v_n integer;
begin
  select e.edition_id into v_ed from side_event e where e.id = p_id;
  if v_ed is null then raise exception 'side_event_not_found' using errcode = 'P0002'; end if;
  if not is_speaker_team(v_ed) then raise exception 'not allowed' using errcode = '42501'; end if;

  -- Mit Zusagen löscht niemand von Versehen: erst die Zusagen klären (Stand ändern), dann löschen.
  select count(*)::integer into v_n from side_event_invite i where i.side_event_id = p_id and i.status = 'yes';
  if v_n > 0 then
    raise exception 'invalid_side_event' using errcode = '22023', detail = 'has_guests:' || v_n::text;
  end if;

  delete from side_event where id = p_id;   -- die Einladungen fallen mit
  perform log_audit('side_event.deleted', 'side_event', p_id::text, null, null);
end $$;

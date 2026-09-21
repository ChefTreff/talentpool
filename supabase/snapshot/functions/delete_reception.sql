create or replace function delete_reception(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid; v_n integer;
begin
  select e.edition_id into v_ed from speaker_reception e where e.id = p_id;
  if v_ed is null then raise exception 'reception_not_found' using errcode = 'P0002'; end if;
  if not is_speaker_team(v_ed) then raise exception 'not allowed' using errcode = '42501'; end if;

  select count(*)::integer into v_n
    from speaker_reception_rsvp r where r.reception_id = p_id and r.status = 'yes';
  if v_n > 0 then
    raise exception 'invalid_reception' using errcode = '22023', detail = 'has_guests:' || v_n::text;
  end if;

  delete from speaker_reception where id = p_id;
  perform log_audit('speaker.reception_deleted', 'speaker_reception', p_id::text, null, null);
end $$;

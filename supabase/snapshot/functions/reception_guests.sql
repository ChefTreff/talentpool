create or replace function reception_guests(p_reception_id uuid)
 RETURNS TABLE(profile_id uuid, first_name text, last_name text, status text, guests integer, note text, responded_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid;
begin
  select e.edition_id into v_ed from speaker_reception e where e.id = p_reception_id;
  if v_ed is null then raise exception 'reception_not_found' using errcode = 'P0002'; end if;
  if not is_speaker_team(v_ed) then raise exception 'not allowed' using errcode = '42501'; end if;

  return query
    select r.profile_id, p.first_name, p.last_name,
           r.status, r.guests, r.note, r.responded_at
      from speaker_reception_rsvp r
      join speaker_profile sp on sp.id = r.profile_id
      join person p on p.id = sp.person_id
     where r.reception_id = p_reception_id
     order by r.status, p.last_name, p.first_name;
end $$;

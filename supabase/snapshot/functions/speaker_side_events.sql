create or replace function speaker_side_events(p_profile_id uuid)
 RETURNS TABLE(side_event_id uuid, title_de text, title_en text, location text, starts_at timestamp with time zone, ends_at timestamp with time zone, published boolean, status text, guests integer, via text, invited_at timestamp with time zone, mailed_at timestamp with time zone, responded_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select sp.edition_id into v_ed from speaker_profile sp where sp.id = p_profile_id;
  if not coalesce(is_speaker_team(v_ed), false) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_ed is null then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;

  return query
    select e.id, e.title_de, e.title_en, e.location, e.starts_at, e.ends_at, e.published,
           i.status, i.guests, i.via, i.invited_at, i.mailed_at, i.responded_at
      from side_event_invite i
      join side_event e on e.id = i.side_event_id
     where i.profile_id = p_profile_id
       and e.edition_id = v_ed
     order by e.starts_at, e.id;
end $$;

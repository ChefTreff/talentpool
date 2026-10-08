create or replace function my_side_events(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, title_de text, title_en text, description_de text, description_en text, location text, address text, starts_at timestamp with time zone, ends_at timestamp with time zone, capacity integer, taken integer, free integer, rsvp_deadline timestamp with time zone, closed boolean, my_status text, my_guests integer, my_note text, invited_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_profile uuid;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_profile := my_speaker_profile_id(p_edition_id);
  if v_profile is null then return; end if;
  -- Nur, wer eingeladen ist, und nur Veröffentlichtes: ohne Einladung gibt es nichts zu sehen, auch keine Fehlermeldung, die verriete,
  -- dass es Side Events gibt.
  return query
    select e.id, e.title_de, e.title_en, e.description_de, e.description_en, e.location, e.address, e.starts_at, e.ends_at,
           e.capacity, side_event_taken(e.id),
           case when e.capacity is null then null else greatest(e.capacity - side_event_taken(e.id), 0) end,
           e.rsvp_deadline,
           e.starts_at <= now() or (e.rsvp_deadline is not null and now() > e.rsvp_deadline),
           i.status, i.guests, i.note, i.invited_at
      from side_event_invite i
      join side_event e on e.id = i.side_event_id
     where i.profile_id = v_profile and e.published
     order by e.starts_at;
end $$;

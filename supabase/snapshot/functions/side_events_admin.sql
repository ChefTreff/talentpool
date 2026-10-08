create or replace function side_events_admin(p_edition_id uuid DEFAULT NULL::uuid, p_side_event_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, edition_id uuid, title_de text, title_en text, description_de text, description_en text, location text, address text, starts_at timestamp with time zone, ends_at timestamp with time zone, capacity integer, rsvp_deadline timestamp with time zone, published boolean, taken integer, yes_count integer, no_count integer, open_count integer, invited_count integer, invites jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select coalesce(p_edition_id,
                  (select e.edition_id from side_event e where e.id = p_side_event_id),
                  (select ev.id from event ev where ev.is_edition order by ev.start_date desc limit 1))
    into v_ed;
  if not is_speaker_team(v_ed) then raise exception 'not allowed' using errcode = '42501'; end if;

  return query
    select e.id, e.edition_id, e.title_de, e.title_en, e.description_de, e.description_en, e.location, e.address, e.starts_at, e.ends_at,
           e.capacity, e.rsvp_deadline, e.published, side_event_taken(e.id),
           (select count(*)::integer from side_event_invite i where i.side_event_id = e.id and i.status = 'yes'),
           (select count(*)::integer from side_event_invite i where i.side_event_id = e.id and i.status = 'no'),
           (select count(*)::integer from side_event_invite i where i.side_event_id = e.id and i.status = 'invited'),
           (select count(*)::integer from side_event_invite i where i.side_event_id = e.id),
           -- Namen und Hinweise nur für das eine Event, das die Seite aufklappt (Modus B).
           case when p_side_event_id is not null and e.id = p_side_event_id then
             (select coalesce(jsonb_agg(jsonb_build_object(
                       'profile_id', i.profile_id, 'first_name', p.first_name, 'last_name', p.last_name, 'status', i.status,
                       'guests', i.guests, 'note', i.note, 'via', i.via, 'invited_at', i.invited_at, 'mailed_at', i.mailed_at,
                       'responded_at', i.responded_at)
                     order by case i.status when 'yes' then 0 when 'invited' then 1 else 2 end, p.last_name, p.first_name), '[]'::jsonb)
                from side_event_invite i
                join speaker_profile sp on sp.id = i.profile_id
                join person p on p.id = sp.person_id
               where i.side_event_id = e.id)
           end
      from side_event e
     where e.edition_id = v_ed
       and (p_side_event_id is null or e.id = p_side_event_id)
     order by e.starts_at;
end $$;

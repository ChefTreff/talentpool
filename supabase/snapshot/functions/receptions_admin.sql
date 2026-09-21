create or replace function receptions_admin(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, edition_id uuid, title_de text, title_en text, description_de text, description_en text, location text, address text, starts_at timestamp with time zone, ends_at timestamp with time zone, capacity integer, rsvp_deadline timestamp with time zone, published boolean, taken integer, yes_count integer, no_count integer, invited_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select coalesce(p_edition_id,
                  (select ev.id from event ev where ev.is_edition order by ev.start_date desc limit 1))
    into v_ed;
  if not is_speaker_team(v_ed) then raise exception 'not allowed' using errcode = '42501'; end if;

  return query
    select e.id, e.edition_id, e.title_de, e.title_en,
           e.description_de, e.description_en, e.location, e.address,
           e.starts_at, e.ends_at, e.capacity, e.rsvp_deadline, e.published,
           reception_taken(e.id),
           (select count(*)::integer from speaker_reception_rsvp r
             where r.reception_id = e.id and r.status = 'yes'),
           (select count(*)::integer from speaker_reception_rsvp r
             where r.reception_id = e.id and r.status = 'no'),
           -- Wie viele dürften kommen? Der Nenner zum Rücklauf.
           (select count(*)::integer from speaker_profile sp
             where sp.edition_id = e.edition_id and sp.reception_eligible)
      from speaker_reception e
     where e.edition_id = v_ed
     order by e.starts_at;
end $$;

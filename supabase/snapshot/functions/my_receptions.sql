create or replace function my_receptions(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, title_de text, title_en text, description_de text, description_en text, location text, address text, starts_at timestamp with time zone, ends_at timestamp with time zone, capacity integer, taken integer, free integer, rsvp_deadline timestamp with time zone, closed boolean, my_status text, my_guests integer, my_note text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_profile uuid;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_profile := my_speaker_profile_id(p_edition_id);
  if v_profile is null then return; end if;
  if not coalesce((select sp.reception_eligible from speaker_profile sp where sp.id = v_profile), false) then
    return;
  end if;

  return query
    select e.id, e.title_de, e.title_en, e.description_de, e.description_en,
           e.location, e.address, e.starts_at, e.ends_at,
           e.capacity, reception_taken(e.id),
           case when e.capacity is null then null
                else greatest(e.capacity - reception_taken(e.id), 0) end,
           e.rsvp_deadline,
           e.rsvp_deadline is not null and now() > e.rsvp_deadline,
           r.status, r.guests, r.note
      from speaker_reception e
      join speaker_profile sp on sp.id = v_profile
      left join speaker_reception_rsvp r on r.reception_id = e.id and r.profile_id = v_profile
     where e.published
       and e.edition_id = sp.edition_id
     order by e.starts_at;
end $$;

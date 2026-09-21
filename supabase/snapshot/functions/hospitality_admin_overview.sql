create or replace function hospitality_admin_overview(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(quota_id uuid, kind text, tier text, label_de text, label_en text, location text, capacity integer, used integer, waitlisted integer, active boolean, window_from timestamp with time zone, window_to timestamp with time zone, bookings jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select q.id, q.kind, q.tier, q.label_de, q.label_en, q.location, q.capacity, hospitality_used(q.id),
           (select count(*)::integer from hospitality_booking b where b.quota_id = q.id and b.status = 'waitlisted'), q.active, q.window_from, q.window_to,
           coalesce((select jsonb_agg(jsonb_build_object(
                        'id', b.id, 'status', b.status, 'guests', b.guests, 'details', b.details, 'team_note', b.team_note, 'created_at', b.created_at,
                        'profile_id', b.profile_id,
                        'speaker_name', (select btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) from speaker_profile sp join person p on p.id = sp.person_id where sp.id = b.profile_id))
                      order by b.status = 'waitlisted', b.created_at)
                     from hospitality_booking b where b.quota_id = q.id and b.status <> 'cancelled'), '[]'::jsonb)
    from hospitality_quota q
    where p_edition_id is null or q.edition_id = p_edition_id
    order by q.kind, q.sort_order, q.window_from nulls last;
end $$;

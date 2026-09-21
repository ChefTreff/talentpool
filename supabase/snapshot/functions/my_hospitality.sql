create or replace function my_hospitality(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, quota_id uuid, kind text, tier text, label_de text, label_en text, location text, window_from timestamp with time zone, window_to timestamp with time zone, status text, guests integer, details jsonb, team_note text, created_at timestamp with time zone, confirmed_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select b.id, b.quota_id, b.kind, q.tier, q.label_de, q.label_en, q.location, q.window_from, q.window_to,
         b.status, b.guests, b.details, b.team_note, b.created_at, b.confirmed_at
  from hospitality_booking b join hospitality_quota q on q.id = b.quota_id
  where b.profile_id = my_speaker_profile_id(p_edition_id)
  order by b.status = 'cancelled', b.kind, q.window_from nulls last, b.created_at
$$;

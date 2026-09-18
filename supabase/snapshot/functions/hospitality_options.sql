create or replace function hospitality_options(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(quota_id uuid, kind text, tier text, label_de text, label_en text, description_de text, description_en text, location text, capacity integer, used integer, free integer, window_from timestamp with time zone, window_to timestamp with time zone, eligible boolean, block_reason text, my_booking jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_sp speaker_profile%rowtype; v_reason text;
begin
  select * into v_sp from speaker_profile where id = my_speaker_profile_id(p_edition_id);
  if not found then return; end if;
  v_reason := hospitality_block_reason(v_sp.id);
  return query
    select q.id, q.kind, q.tier, q.label_de, q.label_en, q.description_de, q.description_en, q.location,
           q.capacity, hospitality_used(q.id), greatest(q.capacity - hospitality_used(q.id), 0), q.window_from, q.window_to,
           (v_reason is null), v_reason,
           (select to_jsonb(b) from (select hb.id, hb.status, hb.guests, hb.details, hb.created_at, hb.confirmed_at, hb.team_note
                                     from hospitality_booking hb where hb.quota_id = q.id and hb.profile_id = v_sp.id and hb.status <> 'cancelled'
                                     order by hb.created_at desc limit 1) b)
    from hospitality_quota q
    where q.edition_id = v_sp.edition_id and q.active
      and (q.kind = 'shuttle' or hotel_tier_rank(q.tier) <= hotel_tier_rank(v_sp.hotel_tier))
    order by q.kind, q.sort_order, q.window_from nulls last;
end $$;

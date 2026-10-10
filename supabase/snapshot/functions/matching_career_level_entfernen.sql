create or replace function matching_career_level_entfernen()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_stops integer; v_sessions integer;
begin
  update company_tour_stop set target_profile = target_profile - 'career_level'
   where jsonb_typeof(target_profile) = 'object' and target_profile ? 'career_level';
  get diagnostics v_stops = row_count;
  update session set format_details = jsonb_set(format_details, '{target_profile}', (format_details->'target_profile') - 'career_level')
   where jsonb_typeof(format_details->'target_profile') = 'object' and (format_details->'target_profile') ? 'career_level';
  get diagnostics v_sessions = row_count;
  return jsonb_build_object('stops', v_stops, 'sessions', v_sessions);
end $$;

create or replace function my_speaker_travel(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_id uuid; v_t speaker_travel%rowtype;
begin
  v_id := my_speaker_profile_id(p_edition_id);
  if v_id is null then return null; end if;
  select * into v_t from speaker_travel where profile_id = v_id;
  return jsonb_build_object(
    'profile_id', v_id,
    'arrival_date', v_t.arrival_date, 'arrival_time', v_t.arrival_time,
    'arrival_mode', v_t.arrival_mode, 'arrival_ref', v_t.arrival_ref,
    'departure_date', v_t.departure_date, 'departure_time', v_t.departure_time,
    'departure_mode', v_t.departure_mode, 'departure_ref', v_t.departure_ref,
    'needs_pickup', coalesce(v_t.needs_pickup, false), 'note', v_t.note,
    'updated_at', v_t.updated_at);
end $$;

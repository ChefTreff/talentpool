create or replace function my_manager_scope()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_team boolean; v_global boolean; v_any boolean;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_team   := is_speaker_team(null);
  v_global := exists (select 1 from role_assignment ra where ra.person_id = v_me and ra.role = 'speaker_manager' and ra.scope_type = 'global'
                      and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now()));
  v_any    := exists (select 1 from role_assignment ra where ra.person_id = v_me and ra.role = 'speaker_manager'
                      and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now()));
  return jsonb_build_object(
    'person_id', v_me,
    'team', v_team,
    'all', v_team or v_global,
    'is_manager', v_team or v_any,
    'editions', coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from (
        select distinct e.id, e.name, e.slug from role_assignment ra join event e on e.id = ra.edition_id
        where ra.person_id = v_me and ra.role = 'speaker_manager' and ra.scope_type = 'edition'
          and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now())) x), '[]'::jsonb),
    'stages', coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from (
        select distinct st.id, st.name, st.event_id, coalesce(e.edition_id, e.id) as edition_id
        from role_assignment ra join stage st on st.id = ra.scope_id join event e on e.id = st.event_id
        where ra.person_id = v_me and ra.role = 'speaker_manager' and ra.scope_type = 'stage'
          and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now())) x), '[]'::jsonb),
    'stage_days', coalesce((select jsonb_agg(to_jsonb(x) order by x.day_date, x.stage_name) from (
        select distinct sd.id, sd.stage_id, st.name as stage_name, sd.event_day_id, ed.day_date, coalesce(e.edition_id, e.id) as edition_id
        from role_assignment ra join stage_day sd on sd.id = ra.scope_id join stage st on st.id = sd.stage_id
        join event_day ed on ed.id = sd.event_day_id join event e on e.id = st.event_id
        where ra.person_id = v_me and ra.role = 'speaker_manager' and ra.scope_type = 'stage_day'
          and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now())) x), '[]'::jsonb),
    'slots', coalesce((select jsonb_agg(to_jsonb(x) order by x.start_at) from (
        select distinct sl.id, sl.stage_id, st.name as stage_name, sl.start_at, sl.end_at, se.id as session_id, coalesce(e.edition_id, e.id) as edition_id
        from role_assignment ra join slot sl on sl.id = ra.scope_id join stage st on st.id = sl.stage_id join event e on e.id = st.event_id
        left join session se on se.slot_id = sl.id
        where ra.person_id = v_me and ra.role = 'speaker_manager' and ra.scope_type = 'slot'
          and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now())) x), '[]'::jsonb),
    'owned_profiles', (select count(*) from speaker_profile sp where sp.owner_person_id = v_me or sp.created_by = v_me)
  );
end $$;

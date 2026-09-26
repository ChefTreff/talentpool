create or replace function slot_stage_leads(p_slot_id uuid)
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  with s as (
    select sl.id, sl.stage_id, st.event_id, sd.id as stage_day_id
      from slot sl
      join stage st on st.id = sl.stage_id
      left join stage_day sd on sd.stage_id = sl.stage_id and sd.event_day_id = sl.event_day_id
     where sl.id = p_slot_id
  ), l as (
    select e.* from s, event_stage_leads(s.event_id) e
  )
  select coalesce(
    (select array_agg(distinct l.person_id) from l, s where l.scope_type = 'slot' and l.scope_id = s.id),
    (select array_agg(distinct l.person_id) from l, s where l.scope_type = 'stage_day' and l.scope_id = s.stage_day_id),
    (select array_agg(distinct l.person_id) from l, s where l.scope_type = 'stage' and l.scope_id = s.stage_id),
    '{}'::uuid[])
$$;

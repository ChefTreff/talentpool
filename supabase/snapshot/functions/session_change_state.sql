create or replace function session_change_state(p_title_de text, p_title_en text, p_slot_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select jsonb_build_object('title_de', p_title_de, 'title_en', p_title_en,
                            'start_at', sl.start_at, 'end_at', sl.end_at, 'stage_id', st.id, 'stage_name', st.name)
    from (select 1) x
    left join slot sl on sl.id = p_slot_id
    left join stage st on st.id = sl.stage_id
$$;

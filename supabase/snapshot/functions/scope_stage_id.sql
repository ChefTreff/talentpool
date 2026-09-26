create or replace function scope_stage_id(p_scope_type text, p_scope_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select case p_scope_type
           when 'stage'     then (select st.id from stage st where st.id = p_scope_id)
           when 'stage_day' then (select sd.stage_id from stage_day sd where sd.id = p_scope_id)
           when 'slot'      then (select sl.stage_id from slot sl where sl.id = p_scope_id)
         end
$$;

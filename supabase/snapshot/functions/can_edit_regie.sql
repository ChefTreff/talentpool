create or replace function can_edit_regie(p_stage_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select is_production_team() or can_edit_stage(p_stage_id)
$$;

create or replace function is_stage_lead_of(p_stage_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  -- Die ganze Bühne (F3): Tag- und Slot-Scope zählen hier nicht — die Wege, die
  -- sie kennen, prüfen sie selbst.
  select coalesce(p_stage_id is not null and exists (
           select 1 from active_roles() ra
            where ra.role = 'speaker_manager' and ra.scope_type = 'stage' and ra.scope_id = p_stage_id), false)
$$;

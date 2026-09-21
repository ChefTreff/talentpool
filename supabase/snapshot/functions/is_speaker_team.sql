create or replace function is_speaker_team(p_edition_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select has_role('admin') or has_role('area_lead_speaker') or has_role('programme_team')
$$;

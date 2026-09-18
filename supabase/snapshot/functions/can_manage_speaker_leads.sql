create or replace function can_manage_speaker_leads()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select has_role('admin') or has_role('area_lead_speaker') or has_role('programme_team')
$$;

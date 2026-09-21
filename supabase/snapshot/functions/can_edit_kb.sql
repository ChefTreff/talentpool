create or replace function can_edit_kb(p_audience text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select has_role('admin')
      or (p_audience && array['partner'] and has_role('area_lead_partner'))
      or (p_audience && array['speaker'] and has_role('area_lead_speaker'))
      or (p_audience && array['talent'] and has_role('area_lead_talent'))
      or (p_audience && array['volunteer'] and has_role('area_lead_volunteers'))
      or (p_audience && array['hackathon'] and has_role('area_lead_hackathon'))
$$;

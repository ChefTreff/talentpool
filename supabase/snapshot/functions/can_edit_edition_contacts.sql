create or replace function can_edit_edition_contacts()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select has_role('admin') or has_role('area_lead_partner') or has_role('area_lead_speaker')
$$;

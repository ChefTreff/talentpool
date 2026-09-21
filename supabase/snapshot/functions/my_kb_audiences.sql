create or replace function my_kb_audiences()
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select case when is_staff() then array['partner','speaker','talent','volunteer','hackathon']
  else array_remove(array[
    'talent',
    case when has_role('partner_contact') or has_role('standbuehne_editor') then 'partner' end,
    case when has_role('speaker') or has_role('speaker_assistant') then 'speaker' end,
    case when has_role('volunteer') or has_role('volunteer_lead') then 'volunteer' end,
    case when has_role('hackathon_participant') or has_role('hackathon_partner') then 'hackathon' end
  ], null) end
$$;

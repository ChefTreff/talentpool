create or replace function can_edit_kb_all(p_audience text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select has_role('admin')
      or (cardinality(p_audience) > 0 and not exists (
            select 1 from unnest(p_audience) as a(key)
             where not case a.key
               when 'partner'   then has_role('area_lead_partner')
               when 'speaker'   then has_role('area_lead_speaker')
               when 'talent'    then has_role('area_lead_talent')
               when 'volunteer' then has_role('area_lead_volunteers')
               when 'hackathon' then has_role('area_lead_hackathon')
               else false end))
$$;

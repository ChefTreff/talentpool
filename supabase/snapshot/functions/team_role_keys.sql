create or replace function team_role_keys()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions'
AS $$
  select array['admin',
               'area_lead_talent', 'area_lead_speaker', 'area_lead_partner',
               'area_lead_volunteers', 'area_lead_hackathon', 'area_lead_production',
               'talent_team', 'programme_team', 'partner_team',
               'volunteers_team', 'hackathon_team', 'production_team',
               'marketing_team']::text[]
$$;

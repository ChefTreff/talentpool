create or replace function team_role_keys()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions'
AS $$
  select array['admin', 'area_lead_talent', 'area_lead_speaker', 'area_lead_partner',
               'area_lead_volunteers', 'area_lead_hackathon', 'area_lead_production',
               'programme_team', 'production_team', 'speaker_manager', 'volunteer_lead',
               'checkin_operator']::text[]
$$;

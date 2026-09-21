create or replace function session_tech_keys()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions'
AS $$
  select array['people_on_stage', 'microphone', 'presentation_media',
               'special_requirements', 'furniture']::text[]
$$;

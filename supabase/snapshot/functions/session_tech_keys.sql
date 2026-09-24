create or replace function session_tech_keys()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions'
AS $$
  select array['microphone', 'special_requirements', 'own_laptop', 'video_with_sound']::text[]
$$;

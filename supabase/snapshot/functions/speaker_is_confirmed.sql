create or replace function speaker_is_confirmed(p_status text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions'
AS $$ select p_status in ('confirmed', 'onboarded', 'ready', 'published', 'attended') $$;

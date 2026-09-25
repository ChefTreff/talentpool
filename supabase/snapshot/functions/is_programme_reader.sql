create or replace function is_programme_reader()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  -- LEAD-032: nur intern. Externe lesen über Veröffentlichung, eigene Auftritte,
  -- ihre Organisation oder die Bühnen, die sie bearbeiten dürfen.
  select is_staff()
$$;

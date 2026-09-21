create or replace function is_hack_judge()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select is_hack_team() or has_role('hackathon_partner')
$$;

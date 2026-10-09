create or replace function session_needs_partner_share(p_session_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select coalesce((select s.access_mode = 'application' and s.format in ('company_tour', 'masterclass', 'side_event', 'interview_table')
                     from session s where s.id = p_session_id), false)
$$;

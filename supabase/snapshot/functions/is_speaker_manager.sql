create or replace function is_speaker_manager(p_person_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select exists (
    select 1 from role_assignment ra
     where ra.person_id = p_person_id
       and ra.role in ('speaker_manager', 'area_lead_speaker', 'admin')
       and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now()))
$$;

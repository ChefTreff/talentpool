create or replace function can_confirm_consent_on_behalf(p_profile_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select speaker_consent_contact(p_profile_id, current_person_id()) is not null
$$;

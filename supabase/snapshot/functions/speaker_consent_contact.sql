create or replace function speaker_consent_contact(p_profile_id uuid, p_person_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select c.id
    from speaker_profile sp
    join speaker_contact c on c.profile_id = sp.id
   where sp.id = p_profile_id
     and sp.mail_via_contact_id is not null
     and p_person_id is not null
     and c.person_id = p_person_id
     and c.has_access
     and c.person_id <> sp.person_id
   order by (c.id = sp.mail_via_contact_id) desc, c.created_at
   limit 1
$$;

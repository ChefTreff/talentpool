create or replace function speaker_mail_recipient(p_profile_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select coalesce(
           (select c.person_id
              from speaker_contact c
              join person p on p.id = c.person_id and p.deleted_at is null
              join person_email pe on pe.person_id = p.id and pe.is_primary
             where c.id = sp.mail_via_contact_id and c.profile_id = sp.id and c.has_access
             limit 1),
           sp.person_id)
    from speaker_profile sp
   where sp.id = p_profile_id
$$;

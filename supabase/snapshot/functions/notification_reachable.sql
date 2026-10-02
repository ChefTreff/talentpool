create or replace function notification_reachable(p_person_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select exists (select 1 from consent_current c
                  where c.person_id = p_person_id and c.consent_type = 'newsletter' and c.granted)
     and exists (select 1 from person p where p.id = p_person_id and p.deleted_at is null)
     and not exists (select 1 from person_email e join suppression s on s.email_hash = email_hash(e.email::text)
                      where e.person_id = p_person_id and e.is_primary)
$$;

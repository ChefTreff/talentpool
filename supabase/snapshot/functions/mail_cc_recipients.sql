create or replace function mail_cc_recipients(p_person_ids uuid[])
 RETURNS TABLE(email text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select distinct pe.email::text
    from person_email pe
    join person p on p.id = pe.person_id and p.deleted_at is null
   where pe.person_id = any(coalesce(p_person_ids, '{}'::uuid[]))
     and pe.is_primary
     and not is_suppressed(pe.email::text)
$$;

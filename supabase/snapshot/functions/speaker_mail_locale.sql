create or replace function speaker_mail_locale(p_profile_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select coalesce(case when p.preferred_language in ('de', 'en') then p.preferred_language end, 'en')
    from person p where p.id = speaker_mail_recipient(p_profile_id)
$$;

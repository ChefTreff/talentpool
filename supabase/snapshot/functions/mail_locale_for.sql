create or replace function mail_locale_for(p_person_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select coalesce(case when p.preferred_language in ('de', 'en') then p.preferred_language end,
                  case when exists (select 1 from speaker_profile sp where sp.person_id = p.id or is_speaker_assistant(sp.id, p.id)) then 'en' else 'de' end)
    from person p where p.id = p_person_id
$$;

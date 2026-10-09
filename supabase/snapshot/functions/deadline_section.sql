create or replace function deadline_section(p_audience text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions'
AS $$
  select case coalesce(p_audience, '')
           when 'speaker' then 'deadlinesSpeaker'
           when 'partner' then 'deadlinesPartner'
           when 'volunteer' then 'deadlinesVolunteers'
           else 'deadlinesSystem' end
$$;

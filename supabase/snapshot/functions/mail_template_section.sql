create or replace function mail_template_section(p_key text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $$
  select case coalesce((select k.category from mail_template_key k where k.key = p_key), 'system')
           when 'speaker' then 'mailSpeaker'
           when 'partner' then 'mailPartner'
           when 'participant' then 'mailParticipants'
           when 'volunteer' then 'mailVolunteers'
           else 'mail' end
$$;

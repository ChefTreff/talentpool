create or replace function notification_topic_export(p_topic text)
 RETURNS TABLE(first_name text, last_name text, email text, preferred_language text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_n integer;
begin
  if not coalesce(has_admin_section('notifications'), false) then raise exception 'not allowed' using errcode = '42501'; end if;
  if not exists (select 1 from vocab_term where vocabulary = 'notification_topic' and key = p_topic) then
    raise exception 'invalid_vocab_value' using errcode = '22023', detail = 'topic';
  end if;
  select count(*) into v_n from person_interest i
   where i.vocabulary = 'notification_topic' and i.term_key = p_topic and notification_reachable(i.person_id);
  perform log_audit('export.notification_topic', 'vocab_term', p_topic, null, jsonb_build_object('rows', v_n));
  return query
    select p.first_name, p.last_name, e.email::text, p.preferred_language
      from person_interest i
      join person p on p.id = i.person_id
      join person_email e on e.person_id = p.id and e.is_primary
     where i.vocabulary = 'notification_topic' and i.term_key = p_topic and notification_reachable(p.id)
     order by p.last_name, p.first_name;
end $$;

create or replace function speaker_profile_check()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not exists (select 1 from event where id = new.edition_id and is_edition) then
    raise exception 'edition_required' using errcode = '23514';
  end if;
  if not is_vocab_key('speaker_type', new.speaker_type) then
    raise exception 'invalid speaker_type' using errcode = '23514', detail = new.speaker_type;
  end if;
  if not is_vocab_key('speaker_pipeline', new.pipeline_status) then
    raise exception 'invalid pipeline_status' using errcode = '23514', detail = new.pipeline_status;
  end if;
  if not is_vocab_key('hospitality_status', new.hospitality_status) then
    raise exception 'invalid hospitality_status' using errcode = '23514', detail = new.hospitality_status;
  end if;
  if not is_vocab_key('hotel_tier', new.hotel_tier) then
    raise exception 'invalid hotel_tier' using errcode = '23514', detail = new.hotel_tier;
  end if;
  if not is_vocab_key('ticket_type', new.pass_type) then
    raise exception 'invalid pass_type' using errcode = '23514', detail = new.pass_type;
  end if;
  if new.assistant_person_id is not null and new.assistant_person_id = new.person_id then
    raise exception 'assistant_is_speaker' using errcode = '23514';
  end if;
  -- LEAD-039: Einordnung. Die Vokabularfelder werden nur geprüft, wenn sie sich
  -- ändern — `is_vocab_key` kennt nur aktive Begriffe, und ein später
  -- stillgelegter Begriff soll das Profil nicht für jede andere Änderung sperren.
  if new.category is not null and (tg_op = 'INSERT' or new.category is distinct from old.category)
     and not is_vocab_key('speaker_category', new.category) then
    raise exception 'invalid_category' using errcode = '22023', detail = new.category;
  end if;
  if new.topic_cluster is not null and (tg_op = 'INSERT' or new.topic_cluster is distinct from old.topic_cluster)
     and not is_vocab_key('topic_cluster', new.topic_cluster) then
    raise exception 'invalid_topic_cluster' using errcode = '22023', detail = new.topic_cluster;
  end if;
  if new.priority is not null and (tg_op = 'INSERT' or new.priority is distinct from old.priority)
     and not is_vocab_key('speaker_priority', new.priority) then
    raise exception 'invalid_priority' using errcode = '22023', detail = new.priority;
  end if;
  if new.recommended_format is not null and (tg_op = 'INSERT' or new.recommended_format is distinct from old.recommended_format)
     and not is_vocab_key('session_format', new.recommended_format) then
    raise exception 'invalid_format' using errcode = '22023', detail = new.recommended_format;
  end if;
  if new.outreach_channel is not null and (tg_op = 'INSERT' or new.outreach_channel is distinct from old.outreach_channel)
     and not is_vocab_key('outreach_channel', new.outreach_channel) then
    raise exception 'invalid_outreach_channel' using errcode = '22023', detail = new.outreach_channel;
  end if;
  if coalesce(length(new.topic_role), 0) > 300 or coalesce(length(new.contact_via), 0) > 200 then
    raise exception 'text_too_long' using errcode = '22023';
  end if;
  -- Nur der Weg, keine Kontaktdaten: Adressen Dritter gehören nach
  -- `speaker_contact`, und nur mit Einverständnis (0148).
  if strpos(coalesce(new.contact_via, ''), '@') > 0 then
    raise exception 'contact_details_not_allowed' using errcode = '22023';
  end if;
  return new;
end $$;

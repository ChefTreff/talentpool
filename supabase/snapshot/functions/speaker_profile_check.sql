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
  return new;
end $$;

create or replace function person_vocab_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if new.job_openness is not null and new.job_openness is distinct from old.job_openness
     and not is_vocab_key('job_openness', new.job_openness) then
    raise exception 'invalid_vocab_value' using errcode = '22023', detail = 'job_openness';
  end if;
  if new.function_area is not null and new.function_area is distinct from old.function_area
     and not is_vocab_key('function_area', new.function_area) then
    raise exception 'invalid_vocab_value' using errcode = '22023', detail = 'function_area';
  end if;
  if new.availability is not null and new.availability is distinct from old.availability
     and not is_vocab_key('availability', new.availability) then
    raise exception 'invalid_vocab_value' using errcode = '22023', detail = 'availability';
  end if;
  if new.mobility is not null and new.mobility is distinct from old.mobility
     and not is_vocab_key('mobility', new.mobility) then
    raise exception 'invalid_vocab_value' using errcode = '22023', detail = 'mobility';
  end if;
  return new;
end $$;

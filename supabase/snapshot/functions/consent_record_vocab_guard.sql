create or replace function consent_record_vocab_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if tg_op = 'INSERT' or new.consent_type is distinct from old.consent_type then
    if not is_vocab_key('consent_type', new.consent_type) then
      raise exception 'invalid_vocab_value' using errcode = '22023', detail = 'consent_type';
    end if;
  end if;
  return new;
end $$;

create or replace function check_travel_mode(p_mode text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if p_mode is null or btrim(p_mode) = '' then return null; end if;
  if not is_vocab_key('travel_mode', p_mode) then
    raise exception 'invalid_travel_mode' using errcode = '22023', detail = p_mode;
  end if;
  return p_mode;
end $$;

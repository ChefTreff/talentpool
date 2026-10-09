create or replace function normalize_phone_e164(p_raw text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'extensions'
AS $$
declare s text := nullif(btrim(coalesce(p_raw, '')), '');
begin
  if s is null then return null; end if;
  s := regexp_replace(s, '\(\s*0\s*\)', '', 'g');
  s := regexp_replace(s, '[^0-9+]', '', 'g');
  if s like '00%' then s := '+' || substr(s, 3);
  elsif s like '0%' then s := '+49' || substr(s, 2);
  end if;
  if s like '+490%' then s := '+49' || substr(s, 5); end if;
  if s ~ '^\+[1-9][0-9]{7,14}$' then return s; end if;
  return null;
end $$;

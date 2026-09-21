create or replace function iban_valid(p_iban text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'extensions'
AS $$
declare v text := upper(regexp_replace(coalesce(p_iban, ''), '\s', '', 'g')); r text := ''; c text; i integer; chunk text := '';
begin
  if length(v) < 15 or length(v) > 34 or v !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]+$' then return false; end if;
  v := substr(v, 5) || substr(v, 1, 4);
  for i in 1..length(v) loop
    c := substr(v, i, 1);
    if c between 'A' and 'Z' then r := r || (ascii(c) - 55)::text; else r := r || c; end if;
  end loop;
  for i in 1..length(r) loop
    chunk := chunk || substr(r, i, 1);
    if length(chunk) >= 9 then chunk := (chunk::bigint % 97)::text; end if;
  end loop;
  return (chunk::bigint % 97) = 1;
end $$;

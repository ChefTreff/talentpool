create or replace function fmt_cents(p_cents integer, p_locale text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions'
AS $$
  select case when p_locale = 'de'
              then translate(to_char(coalesce(p_cents, 0) / 100.0, 'FM9G999G999G990D00'), ',.', '.,') || ' €'
              else '€' || to_char(coalesce(p_cents, 0) / 100.0, 'FM9G999G999G990D00') end
$$;

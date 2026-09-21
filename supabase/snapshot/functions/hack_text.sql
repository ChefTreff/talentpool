create or replace function hack_text(p_de text, p_en text, p_language text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions'
AS $$
  select case when p_language = 'de' then coalesce(nullif(btrim(p_de), ''), p_en)
              else coalesce(nullif(btrim(p_en), ''), p_de) end
$$;

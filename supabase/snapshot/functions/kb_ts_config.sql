create or replace function kb_ts_config(p_language text)
 RETURNS regconfig
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions'
AS $$
  select case when p_language = 'en' then 'english' else 'german' end::regconfig
$$;

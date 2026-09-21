create or replace function mail_fmt_ts(p_ts timestamp with time zone, p_tz text, p_locale text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $$
  select case
    when p_ts is null then null
    when p_locale = 'en' then to_char(p_ts at time zone coalesce(p_tz, 'Europe/Berlin'), 'DD Mon YYYY, HH24:MI')
    else to_char(p_ts at time zone coalesce(p_tz, 'Europe/Berlin'), 'DD.MM.YYYY, HH24:MI') || ' Uhr'
  end
$$;

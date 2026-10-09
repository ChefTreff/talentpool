create or replace function slot_outside_window(p_start timestamp with time zone, p_end timestamp with time zone, p_day date, p_von time without time zone, p_bis time without time zone, p_tz text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $$
  select coalesce(
    (p_von is not null and p_start < ((p_day + p_von) at time zone p_tz))
    or (p_bis is not null and p_end > ((p_day + p_bis) at time zone p_tz)),
    false)
$$;

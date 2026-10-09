create or replace function wiki_fette_zeilen_zu_ueberschriften(p_md text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public', 'extensions'
AS $$
  select string_agg(
           case when u.text is not null and u.text !~ '[.!]$' then '### ' || u.text else z.zeile end,
           E'\n' order by z.nr)
    from regexp_split_to_table(p_md, E'\n') with ordinality as z(zeile, nr)
   cross join lateral (
           select nullif(btrim(regexp_replace(btrim(m.t[1]), ':+$', '')), '') as text
             from (select regexp_match(z.zeile, '^\*\*([^*]+)\*\*:?[ \t\r]*$') as t) as m
         ) as u
$$;

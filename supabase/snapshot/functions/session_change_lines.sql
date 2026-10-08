create or replace function session_change_lines(p_alt jsonb, p_new jsonb, p_tz text, p_locale text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_en boolean := (p_locale = 'en');
  v_tz text := coalesce(p_tz, 'Europe/Berlin');
  v_lines text[] := '{}';
  v_a_start timestamptz := nullif(p_alt->>'start_at', '')::timestamptz;
  v_a_end   timestamptz := nullif(p_alt->>'end_at', '')::timestamptz;
  v_n_start timestamptz := nullif(p_new->>'start_at', '')::timestamptz;
  v_n_end   timestamptz := nullif(p_new->>'end_at', '')::timestamptz;
  v_a_title text; v_n_title text; v_a_time text; v_n_time text; v_a_stage text; v_n_stage text;
  v_open text := case when v_en then 'to be announced' else 'noch offen' end;
begin
  -- Titel in der Sprache der Mail (Rückfall auf die andere), einzeilig.
  v_a_title := regexp_replace(coalesce(case when v_en then coalesce(nullif(p_alt->>'title_en', ''), nullif(p_alt->>'title_de', ''))
                                            else coalesce(nullif(p_alt->>'title_de', ''), nullif(p_alt->>'title_en', '')) end, ''), '\s+', ' ', 'g');
  v_n_title := regexp_replace(coalesce(case when v_en then coalesce(nullif(p_new->>'title_en', ''), nullif(p_new->>'title_de', ''))
                                            else coalesce(nullif(p_new->>'title_de', ''), nullif(p_new->>'title_en', '')) end, ''), '\s+', ' ', 'g');

  if (v_a_start, v_a_end) is distinct from (v_n_start, v_n_end) then
    v_a_time := case when v_a_start is null or v_a_end is null then v_open
      when v_en then to_char(v_a_start at time zone v_tz, 'DD Mon YYYY, HH24:MI') || '–' || to_char(v_a_end at time zone v_tz, 'HH24:MI')
      else to_char(v_a_start at time zone v_tz, 'DD.MM.YYYY, HH24:MI') || '–' || to_char(v_a_end at time zone v_tz, 'HH24:MI') || ' Uhr' end;
    v_n_time := case when v_n_start is null or v_n_end is null then v_open
      when v_en then to_char(v_n_start at time zone v_tz, 'DD Mon YYYY, HH24:MI') || '–' || to_char(v_n_end at time zone v_tz, 'HH24:MI')
      else to_char(v_n_start at time zone v_tz, 'DD.MM.YYYY, HH24:MI') || '–' || to_char(v_n_end at time zone v_tz, 'HH24:MI') || ' Uhr' end;
    v_lines := v_lines || case when v_en then '- **Time:** before ' || v_a_time || ', now ' || v_n_time
                               else '- **Zeit:** bisher ' || v_a_time || ', jetzt ' || v_n_time end;
  end if;
  if (p_alt->>'stage_id') is distinct from (p_new->>'stage_id') then
    v_a_stage := coalesce(nullif(p_alt->>'stage_name', ''), v_open);
    v_n_stage := coalesce(nullif(p_new->>'stage_name', ''), v_open);
    v_lines := v_lines || case when v_en then '- **Stage:** before ' || v_a_stage || ', now ' || v_n_stage
                               else '- **Bühne:** bisher ' || v_a_stage || ', jetzt ' || v_n_stage end;
  end if;
  if v_a_title is distinct from v_n_title then
    v_lines := v_lines || case when v_en then '- **Title:** before “' || v_a_title || '”, now “' || v_n_title || '”'
                               else '- **Titel:** bisher „' || v_a_title || '“, jetzt „' || v_n_title || '“' end;
  end if;
  return array_to_string(v_lines, E'\n');
end $$;

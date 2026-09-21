create or replace function vocab_term_usage(p_vocabulary text, p_key text)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare r record; v_summe integer := 0; v_n integer; v_kennt boolean := false;
begin
  for r in select * from vocab_binding b where b.vocabulary = p_vocabulary loop
    v_kennt := true;
    -- `%I` fuer jeden Bezeichner: die Zeilen stammen zwar aus einer Migration
    -- und nicht aus einer Eingabe, aber eine dynamische Abfrage ohne
    -- Bezeichner-Quoting ist eine Gewohnheit, die man sich nicht angewoehnt.
    if r.is_array then
      execute format('select count(*)::integer from public.%I where $1 = any(%I)%s',
                     r.table_name, r.column_name,
                     case when r.vocabulary_column is null then ''
                          else format(' and %I = $2', r.vocabulary_column) end)
        into v_n using p_key, p_vocabulary;
    else
      execute format('select count(*)::integer from public.%I where %I = $1%s',
                     r.table_name, r.column_name,
                     case when r.vocabulary_column is null then ''
                          else format(' and %I = $2', r.vocabulary_column) end)
        into v_n using p_key, p_vocabulary;
    end if;
    v_summe := v_summe + coalesce(v_n, 0);
  end loop;
  if not v_kennt then return null; end if;
  return v_summe;
end $$;

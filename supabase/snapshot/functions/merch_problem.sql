create or replace function merch_problem(p_schema jsonb, p_values jsonb, p_qty numeric)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare f jsonb; v_key text; v_type text; v_required boolean; v_raw jsonb; v_text text; v_sum numeric; v_max integer;
begin
  for f in select value from jsonb_array_elements(merch_fields(p_schema)) loop
    v_key := nullif(btrim(coalesce(f->>'key', '')), '');
    continue when v_key is null;
    v_type := coalesce(nullif(f->>'type', ''), 'text');
    v_required := coalesce((f->>'required')::boolean, true);
    v_raw := coalesce(p_values, '{}'::jsonb) -> v_key;

    if v_type = 'sizes' then
      if jsonb_typeof(v_raw) = 'object' then
        select coalesce(sum(case when e.value ~ '^-?[0-9]+$' then e.value::numeric else 0 end), 0)
          into v_sum from jsonb_each_text(v_raw) e where e.value ~ '^-?[0-9]+$' and e.value::numeric > 0;
      else
        v_sum := 0;
      end if;
      if v_sum = 0 then
        if v_required then return v_key; end if;
      elsif v_sum <> p_qty then
        return v_key;
      end if;
      continue;
    end if;

    if v_type = 'boolean' then
      if v_required and coalesce(v_raw, 'false'::jsonb) <> 'true'::jsonb then return v_key; end if;
      continue;
    end if;

    v_text := case when v_raw is null or jsonb_typeof(v_raw) = 'null' then null else btrim(v_raw #>> '{}') end;
    if coalesce(v_text, '') = '' then
      if v_required then return v_key; end if;
      continue;
    end if;

    if v_type = 'select' and jsonb_typeof(f->'options') = 'array'
       and not exists (select 1 from jsonb_array_elements_text(f->'options') o where o = v_text) then
      return v_key;
    end if;

    v_max := nullif(f->>'max_length', '')::integer;
    if v_type in ('text', 'textarea') and v_max is not null and length(v_text) > v_max then
      return v_key;
    end if;
  end loop;
  return null;
end $$;

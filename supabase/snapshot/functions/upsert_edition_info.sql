create or replace function upsert_edition_info(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_id uuid; v_ed uuid; v_aud text[];
begin
  if not can_edit_edition_info() then raise exception 'not allowed' using errcode = '42501'; end if;
  select coalesce(nullif(p_data->>'edition_id','')::uuid,
                  (select e.id from event e where e.is_edition order by e.start_date desc limit 1))
    into v_ed;
  v_aud := coalesce((select array_agg(value::text) from jsonb_array_elements_text(p_data->'audience') as t(value)), '{}');
  if cardinality(v_aud) = 0 then
    raise exception 'invalid_audience' using errcode = '22023', detail = 'leer';
  end if;

  insert into edition_info (edition_id, key, audience, label_de, label_en, value_de, value_en, sort_order)
  values (v_ed, btrim(p_data->>'key'), v_aud,
          nullif(btrim(p_data->>'label_de'), ''), nullif(btrim(p_data->>'label_en'), ''),
          nullif(btrim(p_data->>'value_de'), ''), nullif(btrim(p_data->>'value_en'), ''),
          coalesce((p_data->>'sort_order')::integer, 0))
  on conflict (edition_id, key) do update set
    audience = excluded.audience, label_de = excluded.label_de, label_en = excluded.label_en,
    value_de = excluded.value_de, value_en = excluded.value_en,
    sort_order = excluded.sort_order, updated_at = now()
  returning id into v_id;

  perform log_audit('edition_info.upsert', 'edition_info', v_id::text, null, p_data);
  return v_id;
end $$;

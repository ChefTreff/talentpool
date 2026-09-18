create or replace function upsert_portal_video(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_id uuid; v_url text; v_aud text[];
begin
  if not is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  v_id := nullif(p_data->>'id', '')::uuid;
  v_url := btrim(coalesce(p_data->>'url', ''));
  -- Früh und mit eigenem Schlüssel abweisen: ein 23514 aus dem CHECK sagt der
  -- Redaktion nichts, „invalid_video_url" schon.
  if v_id is null or v_url <> '' then
    if not (v_url like 'https://www.loom.com/%' or v_url like 'https://loom.com/%') then
      raise exception 'invalid_video_url' using errcode = '22023', detail = coalesce(nullif(v_url, ''), 'leer');
    end if;
  end if;
  v_aud := coalesce((select array_agg(value::text) from jsonb_array_elements_text(p_data->'audience') as t(value)), '{}');

  if v_id is null then
    insert into portal_video (key, title_de, title_en, url, audience, edition_id, sort_order)
    values (btrim(p_data->>'key'), nullif(btrim(p_data->>'title_de'), ''), nullif(btrim(p_data->>'title_en'), ''),
            v_url, v_aud, nullif(p_data->>'edition_id', '')::uuid,
            coalesce((p_data->>'sort_order')::integer, 0))
    returning id into v_id;
  else
    update portal_video set
      key = coalesce(nullif(btrim(p_data->>'key'), ''), key),
      title_de = case when p_data ? 'title_de' then nullif(btrim(p_data->>'title_de'), '') else title_de end,
      title_en = case when p_data ? 'title_en' then nullif(btrim(p_data->>'title_en'), '') else title_en end,
      url = case when v_url <> '' then v_url else url end,
      audience = case when cardinality(v_aud) > 0 then v_aud else audience end,
      sort_order = coalesce((p_data->>'sort_order')::integer, sort_order),
      updated_at = now()
     where id = v_id;
    if not found then raise exception 'video_not_found' using errcode = 'P0002', detail = v_id::text; end if;
  end if;
  perform log_audit('portal_video.upsert', 'portal_video', v_id::text, null, p_data);
  return v_id;
end $$;

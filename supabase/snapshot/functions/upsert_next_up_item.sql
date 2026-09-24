create or replace function upsert_next_up_item(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_id uuid := nullif(p_data->>'id', '')::uuid;
  v_title text := nullif(btrim(coalesce(p_data->>'title_de', '')), '');
  v_link text := nullif(btrim(coalesce(p_data->>'link_url', '')), '');
  v_before jsonb;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not can_edit_next_up() then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_title is null then raise exception 'title_required' using errcode = '22023'; end if;
  -- Früh und mit eigenem Schlüssel abweisen: ein 23514 sagt der Redaktion nichts.
  if v_link is not null and not (v_link ~ '^https://[^\s]+$' or v_link ~ '^/[^/\\\s][^\s]*$' or v_link = '/') then
    raise exception 'invalid_link_url' using errcode = '22023', detail = v_link;
  end if;

  if v_id is null then
    insert into next_up_item (word_de, word_en, title_de, title_en, teaser_de, teaser_en, link_url,
                              starts_at, visible_from, visible_until, sort_order, active)
    values (nullif(btrim(p_data->>'word_de'), ''), nullif(btrim(p_data->>'word_en'), ''),
            v_title, nullif(btrim(p_data->>'title_en'), ''),
            nullif(btrim(p_data->>'teaser_de'), ''), nullif(btrim(p_data->>'teaser_en'), ''),
            v_link,
            nullif(p_data->>'starts_at', '')::timestamptz,
            nullif(p_data->>'visible_from', '')::timestamptz,
            nullif(p_data->>'visible_until', '')::timestamptz,
            coalesce(nullif(p_data->>'sort_order', '')::integer, 0),
            coalesce((p_data->>'active')::boolean, true))
    returning id into v_id;
  else
    select to_jsonb(n) into v_before from next_up_item n where n.id = v_id;
    if v_before is null then
      raise exception 'next_up_not_found' using errcode = 'P0002', detail = v_id::text;
    end if;
    update next_up_item set
      word_de = nullif(btrim(p_data->>'word_de'), ''),
      word_en = nullif(btrim(p_data->>'word_en'), ''),
      title_de = v_title,
      title_en = nullif(btrim(p_data->>'title_en'), ''),
      teaser_de = nullif(btrim(p_data->>'teaser_de'), ''),
      teaser_en = nullif(btrim(p_data->>'teaser_en'), ''),
      link_url = v_link,
      starts_at = nullif(p_data->>'starts_at', '')::timestamptz,
      visible_from = nullif(p_data->>'visible_from', '')::timestamptz,
      visible_until = nullif(p_data->>'visible_until', '')::timestamptz,
      sort_order = coalesce(nullif(p_data->>'sort_order', '')::integer, 0),
      active = coalesce((p_data->>'active')::boolean, active)
     where id = v_id;
  end if;
  perform log_audit('next_up.upsert', 'next_up_item', v_id::text, v_before, p_data);
  return v_id;
end $$;

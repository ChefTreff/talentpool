create or replace function upsert_kb_article(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_id uuid; v_audience text[]; v_old text[]; v_slug text; v_a text; v_phase text;
begin
  v_id := nullif(p_data->>'id', '')::uuid;
  v_audience := coalesce(
    (select array_agg(value::text) from jsonb_array_elements_text(p_data->'audience') as t(value)),
    '{}');

  if v_id is not null then
    select a.audience into v_old from kb_article a where a.id = v_id;
    if v_old is null then raise exception 'article_not_found' using errcode = 'P0002'; end if;
    -- Wer ändert, muss den Artikel schon jetzt betreuen dürfen — sonst liesse
    -- sich ein fremder Artikel über eine neue Zielgruppenliste übernehmen.
    if not can_edit_kb_all(v_old) then raise exception 'not allowed' using errcode = '42501'; end if;
    if cardinality(v_audience) = 0 then v_audience := v_old; end if;
  end if;
  if cardinality(v_audience) = 0 then
    raise exception 'invalid_audience' using errcode = '22023', detail = 'mindestens eine Zielgruppe';
  end if;
  foreach v_a in array v_audience loop
    if not is_vocab_key('kb_audience', v_a) then
      raise exception 'invalid_audience' using errcode = '22023', detail = v_a;
    end if;
  end loop;
  if not can_edit_kb_all(v_audience) then raise exception 'not allowed' using errcode = '42501'; end if;

  v_phase := coalesce(nullif(p_data->>'phase', ''), 'evergreen');
  if not is_vocab_key('kb_phase', v_phase) then
    raise exception 'invalid_phase' using errcode = '22023', detail = v_phase;
  end if;

  if v_id is null then
    v_slug := nullif(btrim(p_data->>'slug'), '');
    if v_slug is null then
      raise exception 'invalid_slug' using errcode = '22023', detail = 'Slug fehlt';
    end if;
    insert into kb_article (slug, edition_id, language, audience, roles, phase, title, body_md,
                            status, valid_until, owner_person_id, sort_order, updated_by)
    values (v_slug, nullif(p_data->>'edition_id', '')::uuid,
            coalesce(nullif(p_data->>'language', ''), 'de'), v_audience,
            coalesce((select array_agg(value::text) from jsonb_array_elements_text(p_data->'roles') as t(value)), '{}'),
            v_phase,
            coalesce(nullif(btrim(p_data->>'title'), ''), v_slug),
            coalesce(p_data->>'body_md', ''),
            coalesce(nullif(p_data->>'status', ''), 'draft'),
            nullif(p_data->>'valid_until', '')::timestamptz,
            coalesce(nullif(p_data->>'owner_person_id', '')::uuid, current_person_id()),
            coalesce((p_data->>'sort_order')::integer, 0),
            current_person_id())
    returning id into v_id;
  else
    update kb_article set
      language = coalesce(nullif(p_data->>'language', ''), language),
      audience = v_audience,
      roles = case when p_data ? 'roles'
                   then coalesce((select array_agg(value::text) from jsonb_array_elements_text(p_data->'roles') as t(value)), '{}')
                   else roles end,
      phase = v_phase,
      title = coalesce(nullif(btrim(p_data->>'title'), ''), title),
      body_md = coalesce(p_data->>'body_md', body_md),
      valid_until = case when p_data ? 'valid_until' then nullif(p_data->>'valid_until', '')::timestamptz else valid_until end,
      owner_person_id = coalesce(nullif(p_data->>'owner_person_id', '')::uuid, owner_person_id),
      sort_order = coalesce((p_data->>'sort_order')::integer, sort_order),
      updated_by = current_person_id(),
      updated_at = now()
    where id = v_id;
    if not found then raise exception 'article_not_found' using errcode = 'P0002'; end if;
  end if;

  perform log_audit('kb.article_saved', 'kb_article', v_id::text, null,
                    jsonb_build_object('slug', coalesce(v_slug, p_data->>'slug'), 'audience', v_audience));
  return v_id;
exception when unique_violation then
  raise exception 'slug_taken' using errcode = 'P0001',
    detail = 'Für diesen Slug, diese Sprache und diese Edition gibt es den Artikel schon';
end $$;

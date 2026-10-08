create or replace function upsert_kb_article_pair(p_slug text, p_edition_id uuid, p_shared jsonb, p_de jsonb, p_en jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_slug text := nullif(btrim(coalesce(p_slug, '')), '');
  v_geteilt text[] := array['audience', 'roles', 'phase', 'category', 'product_formats', 'valid_until', 'sort_order'];
  v_zeile kb_article%rowtype; v_basis jsonb := '{}'::jsonb; v_shared jsonb := coalesce(p_shared, '{}'::jsonb);
  v_k text; v_lang text; v_in jsonb; v_daten jsonb; v_id uuid; v_ids jsonb := '{}'::jsonb;
begin
  if v_slug is null then raise exception 'invalid_slug' using errcode = '22023', detail = 'Slug fehlt'; end if;
  if jsonb_typeof(v_shared) <> 'object' then raise exception 'fields_required' using errcode = '22023', detail = 'shared'; end if;
  if p_de is null and p_en is null and v_shared = '{}'::jsonb then
    raise exception 'fields_required' using errcode = '22023', detail = 'de/en/shared';
  end if;
  foreach v_k in array array(select jsonb_object_keys(v_shared)) loop
    if not (v_k = any (v_geteilt)) then raise exception 'fields_required' using errcode = '22023', detail = v_k; end if;
  end loop;

  -- Stand der vorhandenen Fassungen als Grundlage: bei einer neuen Sprache erbt sie die gemeinsamen Felder.
  for v_zeile in select * from kb_article a where a.slug = v_slug and a.edition_id is not distinct from p_edition_id
                  order by (a.language = 'de') desc, a.language loop
    v_basis := jsonb_build_object('audience', to_jsonb(v_zeile.audience), 'roles', to_jsonb(v_zeile.roles), 'phase', v_zeile.phase,
                                  'category', v_zeile.category, 'product_formats', to_jsonb(v_zeile.product_formats),
                                  'valid_until', v_zeile.valid_until, 'sort_order', v_zeile.sort_order);
    exit;
  end loop;

  foreach v_lang in array array['de', 'en'] loop
    v_in := case v_lang when 'de' then p_de else p_en end;
    select a.id into v_id from kb_article a
     where a.slug = v_slug and a.language = v_lang and a.edition_id is not distinct from p_edition_id;

    if v_id is null then
      if v_in is null then continue; end if;             -- Sprache nicht angelegt und nicht gewünscht
      v_daten := v_basis || v_shared || coalesce(v_in, '{}'::jsonb)
                 || jsonb_build_object('slug', v_slug, 'edition_id', p_edition_id, 'language', v_lang);
    else
      if v_in is null and v_shared = '{}'::jsonb then continue; end if;   -- nichts zu schreiben
      v_daten := v_shared || coalesce(v_in, '{}'::jsonb) || jsonb_build_object('id', v_id);
    end if;
    -- Status ist je Sprache und läuft über publish_kb_article; hier nie mitschreiben.
    v_daten := v_daten - 'status';
    v_ids := v_ids || jsonb_build_object(v_lang, upsert_kb_article(v_daten));
  end loop;
  return v_ids;
end $$;

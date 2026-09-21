create or replace function upsert_vocab_term(p_data jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_voc text; v_key text; v_vorher jsonb;
begin
  if not has_role('admin') then raise exception 'not allowed' using errcode = '42501'; end if;
  v_voc := nullif(btrim(p_data->>'vocabulary'), '');
  v_key := nullif(btrim(p_data->>'key'), '');
  if v_voc is null or v_key is null then
    raise exception 'fields_required' using errcode = '22023', detail = 'vocabulary und key sind Pflicht';
  end if;
  -- Dieselbe Form, die `is_vocab_key` im Bestand voraussetzt: klein, ohne
  -- Leerzeichen. Ein Schluessel mit Umlaut oder Leerzeichen laesst sich spaeter
  -- nicht mehr sauber in eine URL oder einen Export schreiben.
  if v_key !~ '^[a-z][a-z0-9_]{0,60}$' then
    raise exception 'invalid_key' using errcode = '22023', detail = v_key;
  end if;
  if nullif(btrim(p_data->>'label_de'), '') is null or nullif(btrim(p_data->>'label_en'), '') is null then
    raise exception 'fields_required' using errcode = '22023', detail = 'label_de und label_en sind Pflicht';
  end if;

  select to_jsonb(t) into v_vorher from vocab_term t where t.vocabulary = v_voc and t.key = v_key;

  insert into vocab_term (vocabulary, key, label_de, label_en, sort_order, active,
                          parent_vocabulary, parent_key)
  values (v_voc, v_key, btrim(p_data->>'label_de'), btrim(p_data->>'label_en'),
          coalesce((p_data->>'sort_order')::integer, 0),
          coalesce((p_data->>'active')::boolean, true),
          nullif(btrim(p_data->>'parent_vocabulary'), ''), nullif(btrim(p_data->>'parent_key'), ''))
  on conflict (vocabulary, key) do update set
    label_de = excluded.label_de,
    label_en = excluded.label_en,
    sort_order = excluded.sort_order,
    active = excluded.active,
    parent_vocabulary = excluded.parent_vocabulary,
    parent_key = excluded.parent_key,
    updated_at = now();

  perform log_audit('vocab.upsert', 'vocab_term', v_voc || ':' || v_key, v_vorher, p_data);
  return v_key;
end $$;

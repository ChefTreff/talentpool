create or replace function set_edition_file(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_id uuid; v_kind text; v_ed uuid; v_aud text[];
begin
  if not (is_staff() or is_production_team()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_id := nullif(p_data->>'id', '')::uuid;
  v_kind := coalesce(nullif(p_data->>'kind', ''), 'sonstiges');
  if not is_vocab_key('edition_file_kind', v_kind) then
    raise exception 'invalid_kind' using errcode = '22023', detail = v_kind;
  end if;
  v_aud := coalesce(
    (select array_agg(value::text) from jsonb_array_elements_text(p_data->'audience') as t(value)),
    '{}');
  -- Zielgruppen sind Rechte, keine Etiketten: eine erfundene sperrt die Datei
  -- für alle aus oder öffnet sie für niemanden — beides still.
  if exists (select 1 from unnest(v_aud) a where not is_vocab_key('kb_audience', a)) then
    raise exception 'invalid_audience' using errcode = '22023',
      detail = array_to_string(v_aud, ',');
  end if;

  if v_id is null then
    v_ed := nullif(p_data->>'edition_id', '')::uuid;
    if v_ed is null then
      raise exception 'edition_not_found' using errcode = 'P0002', detail = 'edition_id fehlt';
    end if;
    -- Der Pfad muss unter der Edition liegen, zu der der Eintrag gehört.
    -- Sonst könnte ein Team-Konto einen Eintrag auf eine fremde Datei zeigen
    -- lassen — der Bucket prüft das nicht, er kennt nur Bytes.
    if p_data->>'storage_path' is null
       or p_data->>'storage_path' not like v_ed::text || '/%' then
      raise exception 'invalid_path' using errcode = '22023',
        detail = coalesce(p_data->>'storage_path', 'leer');
    end if;
    insert into edition_file (edition_id, kind, storage_path, filename, mime, size_bytes,
                              label_de, label_en, audience, sort_order, uploaded_by)
    values (v_ed, v_kind, p_data->>'storage_path', coalesce(p_data->>'filename', 'datei'),
            nullif(p_data->>'mime', ''), nullif(p_data->>'size_bytes', '')::bigint,
            nullif(btrim(p_data->>'label_de'), ''), nullif(btrim(p_data->>'label_en'), ''),
            case when cardinality(v_aud) > 0 then v_aud
                 else '{partner,speaker,talent,volunteer,hackathon}'::text[] end,
            coalesce((p_data->>'sort_order')::integer, 0), current_person_id())
    returning id into v_id;
  else
    update edition_file set
      kind = v_kind,
      label_de = case when p_data ? 'label_de' then nullif(btrim(p_data->>'label_de'), '') else label_de end,
      label_en = case when p_data ? 'label_en' then nullif(btrim(p_data->>'label_en'), '') else label_en end,
      audience = case when cardinality(v_aud) > 0 then v_aud else audience end,
      sort_order = coalesce((p_data->>'sort_order')::integer, sort_order),
      updated_at = now()
     where id = v_id;
    if not found then raise exception 'edition_file_not_found' using errcode = 'P0002', detail = v_id::text; end if;
  end if;
  perform log_audit('edition_file.set', 'edition_file', v_id::text, null, p_data - 'storage_path');
  return v_id;
end $$;

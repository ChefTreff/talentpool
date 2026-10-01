-- 0224 · Fragenkatalog pflegen: Abschnitt questionCatalog, upsert/reorder mit Audit, kein Löschen (ADM-061)
-- Angewendet von der Architektur-Session am 01.10.2026 als 20261001082105.
--
-- Zweck: `question_catalog` liess sich nirgends pflegen. Lesen dürfen alle
-- Angemeldeten (RLS `qc_read`), schreiben niemand — `insert/update/delete`
-- sind für `authenticated` seit 0011 entzogen, und eine Funktion gab es nicht.
-- Folge: alle vier Katalogfragen stehen auf `partner_selectable = false`, und
-- der Katalog-Teil der Partner-Fragenseite (PART-045, #228) bleibt leer.
--
-- Teile:
--   * Admin-Abschnitt `questionCatalog` (/admin/fragenkatalog). Rollen: wer mit
--     Bewerbungen arbeitet — Talent, Programm (wie `applications`) und Partner
--     (wie `partner`), denn der Katalog speist beide.
--   * `upsert_question_catalog(p_data)` — anlegen und ändern, Audit.
--   * `reorder_question_catalog(p_ids)` — Reihenfolge in einem Schritt.
--   Kein Löschen: Fragen werden deaktiviert. `session_question.question_id`
--   zeigt auf den Katalog, und Antworten in `application.answers` hängen daran.
--
-- Schutz gespeicherter Antworten: `key` ist nach dem Anlegen fest. `type`
-- lässt sich nur ändern, solange keine Session die Frage benutzt — aus einem
-- Freitext wird sonst eine Auswahl, und die vorhandenen Antworten passen nicht
-- mehr dazu (P0001 `question_in_use`).
set search_path = public, extensions;

insert into admin_section_role (section, role) values
  ('questionCatalog', 'admin'),
  ('questionCatalog', 'area_lead_talent'),
  ('questionCatalog', 'talent_team'),
  ('questionCatalog', 'programme_team'),
  ('questionCatalog', 'area_lead_partner'),
  ('questionCatalog', 'partner_team');

-- ---------------------------------------------------------------------------
create or replace function upsert_question_catalog(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_id uuid := nullif(p_data->>'id', '')::uuid;
  v_alt question_catalog%rowtype;
  v_key text := nullif(btrim(coalesce(p_data->>'key', '')), '');
  v_type text := nullif(btrim(coalesce(p_data->>'type', '')), '');
  v_label_de text := nullif(btrim(coalesce(p_data->>'label_de', '')), '');
  v_label_en text := nullif(btrim(coalesce(p_data->>'label_en', '')), '');
  v_options jsonb := case when jsonb_typeof(p_data->'options') = 'array' then p_data->'options' end;
  v_opt jsonb; v_keys text[] := '{}'; v_ok text;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_admin_section('questionCatalog') then raise exception 'not allowed' using errcode = '42501'; end if;

  if v_id is not null then
    select * into v_alt from question_catalog q where q.id = v_id;
    if not found then raise exception 'question_not_found' using errcode = 'P0002', detail = v_id::text; end if;
    v_key := v_alt.key;                      -- der Schlüssel bleibt
    v_type := coalesce(v_type, v_alt.type);
    if v_type <> v_alt.type and exists (select 1 from session_question sq where sq.question_id = v_id) then
      raise exception 'question_in_use' using errcode = 'P0001', detail = v_alt.type || '→' || v_type;
    end if;
  else
    if v_key is null or v_key !~ '^[a-z][a-z0-9_]{1,62}$' then
      raise exception 'invalid_key' using errcode = '22023', detail = coalesce(v_key, 'null');
    end if;
  end if;

  if v_type is null or v_type not in ('text','textarea','select','multiselect','boolean','url','file','number') then
    raise exception 'invalid_type' using errcode = '22023', detail = coalesce(v_type, 'null');
  end if;
  if v_label_de is null then raise exception 'label_de_required' using errcode = '22023'; end if;
  if v_label_en is null then raise exception 'label_en_required' using errcode = '22023'; end if;

  -- Auswahlfragen brauchen Optionen, alle anderen dürfen keine tragen.
  if v_type in ('select', 'multiselect') then
    if v_options is null or jsonb_array_length(v_options) < 2 then
      raise exception 'options_required' using errcode = '22023', detail = 'mindestens zwei';
    end if;
    for v_opt in select value from jsonb_array_elements(v_options) loop
      v_ok := nullif(btrim(coalesce(v_opt->>'key', '')), '');
      if v_ok is null or v_ok !~ '^[a-z0-9_]{1,63}$'
         or nullif(btrim(coalesce(v_opt->>'label_de', '')), '') is null
         or nullif(btrim(coalesce(v_opt->>'label_en', '')), '') is null then
        raise exception 'invalid_options' using errcode = '22023', detail = v_opt::text;
      end if;
      if v_ok = any (v_keys) then
        raise exception 'invalid_options' using errcode = '22023', detail = 'doppelt: ' || v_ok;
      end if;
      v_keys := array_append(v_keys, v_ok);
    end loop;
  else
    v_options := null;
  end if;

  if v_id is null then
    insert into question_catalog (key, label_de, label_en, help_de, help_en, type, options,
                                  active, partner_selectable, sort_order)
    values (v_key, v_label_de, v_label_en,
            nullif(btrim(coalesce(p_data->>'help_de', '')), ''),
            nullif(btrim(coalesce(p_data->>'help_en', '')), ''),
            v_type, v_options,
            coalesce((p_data->>'active')::boolean, true),
            coalesce((p_data->>'partner_selectable')::boolean, false),
            coalesce((p_data->>'sort_order')::integer,
                     (select coalesce(max(q.sort_order), 0) + 1 from question_catalog q)))
    returning id into v_id;
    perform log_audit('question_catalog.created', 'question_catalog', v_id::text, null,
                      jsonb_build_object('key', v_key, 'type', v_type));
  else
    update question_catalog q set
      label_de = v_label_de,
      label_en = v_label_en,
      help_de = case when p_data ? 'help_de' then nullif(btrim(coalesce(p_data->>'help_de', '')), '') else q.help_de end,
      help_en = case when p_data ? 'help_en' then nullif(btrim(coalesce(p_data->>'help_en', '')), '') else q.help_en end,
      type = v_type,
      options = v_options,
      active = coalesce((p_data->>'active')::boolean, q.active),
      partner_selectable = coalesce((p_data->>'partner_selectable')::boolean, q.partner_selectable),
      sort_order = coalesce((p_data->>'sort_order')::integer, q.sort_order)
    where q.id = v_id;
    perform log_audit('question_catalog.updated', 'question_catalog', v_id::text,
                      jsonb_build_object('type', v_alt.type, 'active', v_alt.active,
                                         'partner_selectable', v_alt.partner_selectable,
                                         'label_de', v_alt.label_de),
                      jsonb_build_object('type', v_type,
                                         'active', coalesce((p_data->>'active')::boolean, v_alt.active),
                                         'partner_selectable', coalesce((p_data->>'partner_selectable')::boolean, v_alt.partner_selectable),
                                         'label_de', v_label_de));
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'key_taken' using errcode = 'P0001', detail = coalesce(v_key, 'null');
end $$;

-- ---------------------------------------------------------------------------
-- Reihenfolge in einem Schritt. Verlangt **alle** Fragen: eine Teilliste
-- hinterliesse doppelte Positionen, und welche Frage dann zuerst kommt,
-- entschiede der Zufall der Abfrage.
create or replace function reorder_question_catalog(p_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_alle integer; v_gegeben integer;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_admin_section('questionCatalog') then raise exception 'not allowed' using errcode = '42501'; end if;

  select count(*) into v_alle from question_catalog;
  select count(distinct x) into v_gegeben from unnest(coalesce(p_ids, '{}')) as x
   where x in (select q.id from question_catalog q);
  if v_gegeben <> v_alle or cardinality(coalesce(p_ids, '{}')) <> v_alle then
    raise exception 'invalid_order' using errcode = '22023',
      detail = v_gegeben::text || ' von ' || v_alle::text;
  end if;

  update question_catalog q set sort_order = t.pos
    from unnest(p_ids) with ordinality as t(id, pos)
   where q.id = t.id and q.sort_order is distinct from t.pos;

  perform log_audit('question_catalog.reordered', 'question_catalog', null, null,
                    jsonb_build_object('ids', to_jsonb(p_ids)));
end $$;

select harden_definer_functions();

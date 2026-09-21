create or replace function upsert_deliverable_template(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_id uuid := nullif(p_data->>'id', '')::uuid; r record; v_synced integer := 0; v_rule jsonb; v_unknown text;
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_data ? 'fulfilled_by_sku' and nullif(p_data->>'fulfilled_by_sku', '') is not null and not exists (select 1 from product where sku = p_data->>'fulfilled_by_sku') then
    raise exception 'unknown_sku' using errcode = '22023', detail = p_data->>'fulfilled_by_sku';
  end if;

  -- Neu (0111): nur Regeln annehmen, die `deliverable_due` auch auswertet. `{}` heißt
  -- „ohne Frist" und bleibt erlaubt — eine Pflicht ohne Stichtag ist ein gültiger Fall,
  -- eine Pflicht mit einer erfundenen Regel nicht. Genau daran ist die Challenge-Pflicht
  -- ein halbes Jahr lang still gescheitert.
  if p_data ? 'due_rule' then
    v_rule := coalesce(p_data->'due_rule', '{}'::jsonb);
    if jsonb_typeof(v_rule) <> 'object' then
      raise exception 'invalid_due_rule' using errcode = '22023', detail = 'object_required';
    end if;
    select string_agg(k, ',') into v_unknown
      from jsonb_object_keys(v_rule) k where k not in ('deadline_key', 'offset_days');
    if v_unknown is not null then
      raise exception 'invalid_due_rule' using errcode = '22023', detail = v_unknown;
    end if;
    if v_rule ? 'deadline_key' and nullif(btrim(v_rule->>'deadline_key'), '') is null then
      raise exception 'invalid_due_rule' using errcode = '22023', detail = 'deadline_key_empty';
    end if;
  end if;

  if v_id is null then
    if nullif(p_data->>'key', '') is null or nullif(p_data->>'type', '') is null or nullif(p_data->>'label_de', '') is null or nullif(p_data->>'label_en', '') is null then
      raise exception 'fields_required' using errcode = '22023';
    end if;
    insert into deliverable_template (key, product_sku, category, type, label_de, label_en, description_de, description_en, due_rule, file_rules, required, audience_roles, sort, active, answers_schema, fulfilled_by_sku)
    values (p_data->>'key', nullif(p_data->>'product_sku', ''), nullif(p_data->>'category', ''), p_data->>'type', p_data->>'label_de', p_data->>'label_en',
            nullif(p_data->>'description_de', ''), nullif(p_data->>'description_en', ''), coalesce(p_data->'due_rule', '{}'::jsonb), p_data->'file_rules',
            coalesce((p_data->>'required')::boolean, true), coalesce((select array_agg(x) from jsonb_array_elements_text(p_data->'audience_roles') x), '{primary_ops,additional}'),
            coalesce((p_data->>'sort')::integer, 100), coalesce((p_data->>'active')::boolean, true), p_data->'answers_schema', nullif(p_data->>'fulfilled_by_sku', ''))
    returning id into v_id;
  else
    update deliverable_template set
      label_de = coalesce(nullif(p_data->>'label_de', ''), label_de), label_en = coalesce(nullif(p_data->>'label_en', ''), label_en),
      description_de = case when p_data ? 'description_de' then nullif(p_data->>'description_de', '') else description_de end,
      description_en = case when p_data ? 'description_en' then nullif(p_data->>'description_en', '') else description_en end,
      due_rule = case when p_data ? 'due_rule' then p_data->'due_rule' else due_rule end,
      file_rules = case when p_data ? 'file_rules' then p_data->'file_rules' else file_rules end,
      required = case when p_data ? 'required' then (p_data->>'required')::boolean else required end,
      sort = case when p_data ? 'sort' then (p_data->>'sort')::integer else sort end,
      active = case when p_data ? 'active' then (p_data->>'active')::boolean else active end,
      answers_schema = case when p_data ? 'answers_schema' then p_data->'answers_schema' else answers_schema end,
      fulfilled_by_sku = case when p_data ? 'fulfilled_by_sku' then nullif(p_data->>'fulfilled_by_sku', '') else fulfilled_by_sku end
    where id = v_id;
    if not found then raise exception 'template_not_found' using errcode = 'P0002'; end if;
  end if;
  -- Bestehende Organisationen laufender Editionen sofort nachziehen (0056)
  for r in select e.id from event e where e.is_edition and coalesce(e.end_date, current_date) >= current_date loop
    v_synced := v_synced + resync_deliverables(r.id);
  end loop;
  perform log_audit('partner.template', 'deliverable_template', v_id::text, null, p_data || jsonb_build_object('resynced_org_editions', v_synced));
  return v_id;
end $$;

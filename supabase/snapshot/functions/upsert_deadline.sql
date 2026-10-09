create or replace function upsert_deadline(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_edition uuid := nullif(p_data->>'edition_id', '')::uuid;
  v_key text := nullif(btrim(coalesce(p_data->>'key', '')), '');
  v_aud text := coalesce(nullif(btrim(coalesce(p_data->>'audience', '')), ''), 'all');
  v_de text := nullif(btrim(coalesce(p_data->>'label_de', '')), '');
  v_en text := nullif(btrim(coalesce(p_data->>'label_en', '')), '');
  v_due timestamptz := nullif(p_data->>'due_at', '')::timestamptz;
  v_id_in uuid := nullif(p_data->>'id', '')::uuid;
  v_hours integer; v_tage integer; v_old deadline%rowtype; v_neu deadline%rowtype; v_id uuid; v_basis text; v_n integer := 1;
begin
  -- Ändern **über die Id**: der Schlüssel ist eine Code-Schnittstelle und steht nirgends in der Oberfläche, die Zeile kennt nur die Id.
  if v_id_in is not null then
    select * into v_old from deadline d where d.id = v_id_in;
    if not found then raise exception 'deadline_not_found' using errcode = 'P0002', detail = v_id_in::text; end if;
    v_edition := v_old.edition_id;
    v_key := v_old.key;
  end if;
  if v_edition is null then raise exception 'fields_required' using errcode = '22023', detail = 'edition_id'; end if;
  if not exists (select 1 from event e where e.id = v_edition and e.is_edition) then
    raise exception 'edition_not_found' using errcode = 'P0002', detail = v_edition::text;
  end if;
  if v_due is null then raise exception 'fields_required' using errcode = '22023', detail = 'due_at'; end if;

  -- Erinnerung: Tage gewinnen vor Stunden; ungültig ist ein Fehler, kein stilles Zurechtbiegen.
  if p_data ? 'reminder_days' and nullif(p_data->>'reminder_days', '') is not null then
    v_tage := (p_data->>'reminder_days')::integer;
    if v_tage < 0 or v_tage > 90 then raise exception 'invalid_reminder' using errcode = '22023', detail = v_tage::text; end if;
    v_hours := v_tage * 24;
  elsif p_data ? 'reminder_lead_hours' and nullif(p_data->>'reminder_lead_hours', '') is not null then
    v_hours := (p_data->>'reminder_lead_hours')::integer;
    if v_hours < 0 or v_hours > 2160 then raise exception 'invalid_reminder' using errcode = '22023', detail = v_hours::text; end if;
  end if;

  if v_key is not null then
    select * into v_old from deadline d where d.edition_id = v_edition and d.key = v_key;
  end if;

  if v_old.id is not null then
    if not can_edit_deadline(v_old.audience) then raise exception 'not allowed' using errcode = '42501'; end if;
    if v_aud <> v_old.audience then
      -- Die Zielgruppe einer Systemfrist ist fest: Portale und Jobs lesen sie.
      if not v_old.custom then raise exception 'deadline_is_system' using errcode = 'P0001', detail = v_old.audience; end if;
      if not can_edit_deadline(v_aud) then raise exception 'not allowed' using errcode = '42501'; end if;
    end if;
    update deadline set
      audience = v_aud, due_at = v_due,
      label_de = coalesce(v_de, label_de), label_en = coalesce(v_en, label_en),
      description_de = case when p_data ? 'description_de' then nullif(p_data->>'description_de', '') else description_de end,
      description_en = case when p_data ? 'description_en' then nullif(p_data->>'description_en', '') else description_en end,
      reminder_lead_hours = coalesce(v_hours, reminder_lead_hours),
      updated_at = now()
     where id = v_old.id returning * into v_neu;
  else
    if not can_edit_deadline(v_aud) then raise exception 'not allowed' using errcode = '42501'; end if;
    if v_de is null then raise exception 'fields_required' using errcode = '22023', detail = 'label_de'; end if;
    if v_en is null then raise exception 'fields_required' using errcode = '22023', detail = 'label_en'; end if;
    if v_key is not null then
      -- Ein Schlüssel von aussen ist eine Systemfrist, auf die Code verweisen soll — das legt nur admin an.
      if not has_admin_section('deadlinesSystem') then raise exception 'not allowed' using errcode = '42501'; end if;
      if v_key !~ '^[a-z][a-z0-9_]{2,60}$' then raise exception 'fields_required' using errcode = '22023', detail = 'key'; end if;
    else
      v_basis := trim(both '_' from regexp_replace(lower(translate(replace(v_de, 'ß', 'ss'), 'äöüÄÖÜ', 'aouAOU')), '[^a-z0-9]+', '_', 'g'));
      v_basis := 'custom_' || coalesce(nullif(left(v_basis, 40), ''), 'frist');
      v_key := v_basis;
      while exists (select 1 from deadline d where d.edition_id = v_edition and d.key = v_key) loop
        v_n := v_n + 1;
        v_key := v_basis || '_' || v_n;
      end loop;
    end if;
    insert into deadline (edition_id, key, audience, due_at, label_de, label_en, description_de, description_en, reminder_lead_hours, custom)
    values (v_edition, v_key, v_aud, v_due, v_de, v_en, nullif(p_data->>'description_de', ''), nullif(p_data->>'description_en', ''),
            coalesce(v_hours, 48), coalesce(nullif(p_data->>'key', '') is null, false))
    returning * into v_neu;
  end if;

  perform log_audit('deadline.upsert', 'deadline', v_neu.id::text,
                    case when v_old.id is null then null else
                      jsonb_build_object('audience', v_old.audience, 'due_at', v_old.due_at, 'label_de', v_old.label_de, 'label_en', v_old.label_en,
                                         'reminder_lead_hours', v_old.reminder_lead_hours) end,
                    jsonb_build_object('key', v_neu.key, 'audience', v_neu.audience, 'due_at', v_neu.due_at, 'label_de', v_neu.label_de,
                                       'label_en', v_neu.label_en, 'reminder_lead_hours', v_neu.reminder_lead_hours, 'custom', v_neu.custom));
  return v_neu.id;
end $$;

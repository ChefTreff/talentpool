create or replace function upsert_session(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_id    uuid := nullif(p_data->>'id', '')::uuid;
  v_event uuid := nullif(p_data->>'event_id', '')::uuid;
  v_pid   uuid := current_person_id();
  v_host  uuid := nullif(p_data->>'host_org_id', '')::uuid;
  v_allowed uuid[];
begin
  if v_pid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if v_id is null then
    if v_event is null then
      raise exception 'event_id required' using errcode = '22023';
    end if;
    if not (is_programme_editor(v_event) or has_role('speaker_manager') or has_role('standbuehne_editor')) then
      raise exception 'not allowed' using errcode = '42501';
    end if;
    -- Bühnen-Editoren ohne Programm-/Manager-Recht: Gastgeberin ist die eigene Organisation
    if not (is_programme_editor(v_event) or has_role('speaker_manager')) then
      v_allowed := stage_editor_orgs(v_pid);
      if v_host is null and cardinality(v_allowed) = 1 then v_host := v_allowed[1]; end if;
      if v_host is null or not (v_host = any(v_allowed)) then
        raise exception 'not allowed' using errcode = '42501', detail = 'host_org_required';
      end if;
    end if;
    insert into session (
      event_id, title_de, title_en, description_de, description_en,
      format, language, access_mode, eligibility_rule, capacity, ticket_required,
      application_deadline, confirm_by_hours, host_org_id, track_id, moderation_person_id,
      tags, created_by, updated_by
    ) values (
      v_event,
      nullif(btrim(p_data->>'title_de'), ''),
      nullif(btrim(p_data->>'title_en'), ''),
      nullif(btrim(p_data->>'description_de'), ''),
      nullif(btrim(p_data->>'description_en'), ''),
      coalesce(p_data->>'format', 'keynote'),
      coalesce(p_data->>'language', 'de'),
      coalesce(p_data->>'access_mode', 'open'),
      p_data->'eligibility_rule',
      nullif(p_data->>'capacity', '')::integer,
      coalesce((p_data->>'ticket_required')::boolean, true),
      nullif(p_data->>'application_deadline', '')::timestamptz,
      coalesce(nullif(p_data->>'confirm_by_hours', '')::integer, 72),
      v_host,
      nullif(p_data->>'track_id', '')::uuid,
      nullif(p_data->>'moderation_person_id', '')::uuid,
      coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p_data->'tags', '[]'::jsonb)) x), '{}'),
      v_pid, v_pid
    ) returning id into v_id;
    perform log_audit('session.create', 'session', v_id::text, null, p_data);
    return v_id;
  end if;

  if not can_edit_session(v_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select s.event_id into v_event from session s where s.id = v_id;
  if p_data ? 'host_org_id' and not (is_programme_editor(v_event) or has_role('speaker_manager')) then
    v_allowed := stage_editor_orgs(v_pid);
    if v_host is null or not (v_host = any(v_allowed)) then
      raise exception 'not allowed' using errcode = '42501', detail = 'host_org_required';
    end if;
  end if;

  update session set
    title_de       = case when p_data ? 'title_de'       then nullif(btrim(p_data->>'title_de'), '')       else title_de       end,
    title_en       = case when p_data ? 'title_en'       then nullif(btrim(p_data->>'title_en'), '')       else title_en       end,
    description_de = case when p_data ? 'description_de' then nullif(btrim(p_data->>'description_de'), '') else description_de end,
    description_en = case when p_data ? 'description_en' then nullif(btrim(p_data->>'description_en'), '') else description_en end,
    format         = coalesce(p_data->>'format', format),
    language       = coalesce(p_data->>'language', language),
    access_mode    = coalesce(p_data->>'access_mode', access_mode),
    eligibility_rule = coalesce(p_data->'eligibility_rule', eligibility_rule),
    capacity       = case when p_data ? 'capacity' then nullif(p_data->>'capacity', '')::integer else capacity end,
    ticket_required = coalesce((p_data->>'ticket_required')::boolean, ticket_required),
    application_deadline = case when p_data ? 'application_deadline' then nullif(p_data->>'application_deadline', '')::timestamptz else application_deadline end,
    confirm_by_hours = coalesce(nullif(p_data->>'confirm_by_hours', '')::integer, confirm_by_hours),
    host_org_id    = case when p_data ? 'host_org_id' then v_host else host_org_id end,
    track_id       = case when p_data ? 'track_id' then nullif(p_data->>'track_id', '')::uuid else track_id end,
    moderation_person_id = case when p_data ? 'moderation_person_id' then nullif(p_data->>'moderation_person_id', '')::uuid else moderation_person_id end,
    tags           = case when p_data ? 'tags' then coalesce((select array_agg(x) from jsonb_array_elements_text(p_data->'tags') x), '{}') else tags end,
    updated_by     = v_pid
  where id = v_id;
  perform log_audit('session.update', 'session', v_id::text, null, p_data);
  return v_id;
end $$;

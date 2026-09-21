create or replace function partner_update_session(p_session_id uuid, p_fields jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_se session; v_org uuid; v_details jsonb; v_bad text; v_zurueck boolean := false;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_se from session where id = p_session_id;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  v_org := v_se.partner_org_id;
  if v_org is null or not partner_can_edit(v_org) then raise exception 'not allowed' using errcode = '42501'; end if;

  select string_agg(k, ',') into v_bad from jsonb_object_keys(p_fields) k
   where k not in ('title_de','title_en','description_de','description_en','language','format_details');
  if v_bad is not null then
    raise exception 'not_editable' using errcode = 'P0001', detail = v_bad;
  end if;
  if p_fields ? 'language' and (p_fields->>'language') not in ('de','en','mixed') then
    raise exception 'invalid_language' using errcode = '22023', detail = p_fields->>'language';
  end if;

  v_details := case when p_fields ? 'format_details'
                    -- Auflage 6: die Organisation mitgeben, sonst prüft die Funktion nur die Form.
                    then check_format_details(v_se.format, p_fields->'format_details', v_org)
                    else v_se.format_details end;

  -- Auflage 4: Nur die Felder, die im veröffentlichten Programm stehen, lösen eine erneute
  -- Freigabe aus — und nur, wenn sie sich wirklich ändern. Wer denselben Titel noch einmal
  -- speichert, soll nicht aus dem Programm fallen.
  v_zurueck := v_se.publish_status = 'published' and (
       (p_fields ? 'title_de'       and nullif(btrim(p_fields->>'title_de'), '')       is distinct from v_se.title_de)
    or (p_fields ? 'title_en'       and nullif(btrim(p_fields->>'title_en'), '')       is distinct from v_se.title_en)
    or (p_fields ? 'description_de' and nullif(btrim(p_fields->>'description_de'), '') is distinct from v_se.description_de)
    or (p_fields ? 'description_en' and nullif(btrim(p_fields->>'description_en'), '') is distinct from v_se.description_en)
    or (p_fields ? 'language'       and (p_fields->>'language')                        is distinct from v_se.language));

  update session set
    title_de = case when p_fields ? 'title_de' then nullif(btrim(p_fields->>'title_de'), '') else title_de end,
    title_en = case when p_fields ? 'title_en' then nullif(btrim(p_fields->>'title_en'), '') else title_en end,
    description_de = case when p_fields ? 'description_de' then nullif(btrim(p_fields->>'description_de'), '') else description_de end,
    description_en = case when p_fields ? 'description_en' then nullif(btrim(p_fields->>'description_en'), '') else description_en end,
    language = case when p_fields ? 'language' then p_fields->>'language' else language end,
    format_details = v_details,
    publish_status = case when v_zurueck then 'review' else publish_status end,
    updated_by = current_person_id()
  where id = p_session_id;

  if v_zurueck and v_se.slot_id is not null then
    -- Der Slot zieht mit, wie bei der Ablehnung in `release_partner_session`: die Zeit bleibt
    -- reserviert, gilt aber nicht mehr als zugesagt.
    update slot set status = 'requested' where id = v_se.slot_id and status = 'final';
  end if;

  perform log_audit('partner.session_update', 'session', p_session_id::text,
                    jsonb_build_object('format_details', v_se.format_details,
                                       'publish_status', v_se.publish_status),
                    jsonb_build_object('fields', (select array_agg(k) from jsonb_object_keys(p_fields) k),
                                       'back_to_review', v_zurueck));
  return v_zurueck;
end $$;

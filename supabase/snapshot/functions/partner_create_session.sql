create or replace function partner_create_session(p_org_id uuid, p_format text, p_stage_id uuid, p_day_id uuid, p_start timestamp with time zone, p_end timestamp with time zone, p_title_de text, p_capacity integer DEFAULT 1, p_details jsonb DEFAULT '{}'::jsonb, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_oe org_edition; v_me uuid := current_person_id(); v_slot uuid; v_id uuid;
        v_stage stage; v_day event_day; v_details jsonb; v_free integer;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not partner_can_edit(p_org_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_format not in ('side_event', 'interview_table') then
    raise exception 'invalid_format' using errcode = '22023', detail = coalesce(p_format, 'null');
  end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then raise exception 'org_edition_not_found' using errcode = 'P0002'; end if;
  if nullif(btrim(coalesce(p_title_de, '')), '') is null then
    raise exception 'title_required' using errcode = '22023';
  end if;
  if p_end is null or p_start is null or p_end <= p_start then
    raise exception 'invalid_time' using errcode = '22023', detail = 'end_after_start';
  end if;

  -- Die Fläche gehört dieser Organisation und ist vom richtigen Typ.
  select * into v_stage from stage where id = p_stage_id and active;
  if not found then raise exception 'stage_not_found' using errcode = 'P0002'; end if;
  if v_stage.partner_org_id is distinct from p_org_id then
    raise exception 'not allowed' using errcode = '42501', detail = 'stage_not_yours';
  end if;
  if v_stage.type <> (case p_format when 'interview_table' then 'interview_table' else 'side_event_venue' end) then
    raise exception 'invalid_format' using errcode = '22023', detail = 'stage_type';
  end if;
  select * into v_day from event_day where id = p_day_id and event_id = v_stage.event_id;
  if not found then raise exception 'day_not_found' using errcode = 'P0002'; end if;

  -- Anspruch: beim Side-Event zählt jedes Stück, beim Interview Table der Tisch — die Fläche
  -- existiert dann bereits, und wie viele Gespräche daraufpassen, entscheidet der Kalender.
  if p_format = 'side_event' then
    v_free := partner_entitlement(v_oe.id, 'side_event');
    if v_free <= 0 then raise exception 'no_entitlement' using errcode = 'P0001', detail = p_format; end if;
  end if;

  -- Auflage 6: auch beim Anlegen die Organisation mitgeben, sonst könnte ein Partner beim
  -- ersten Speichern ein fremdes Bild setzen und es danach nie wieder anfassen.
  v_details := check_format_details(p_format, p_details, p_org_id);

  -- Zeiten am Slot (Weg A, Konrad 18.09.): der Ausschluss-Constraint `slot_no_overlap`
  -- verhindert zwei Gespräche zur selben Zeit an derselben Fläche — ohne eigene Prüfung.
  begin
    -- Status aus dem Vokabular `slot_status`: solange das Team freigeben muss, ist der Slot
    -- **angefragt**, nicht final — sonst stünde im Board eine Zusage, die niemand gegeben hat.
    insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status, source_ref, created_by)
    values (p_stage_id, p_day_id, p_start, p_end, 'partner_block',
            case when session_needs_release(v_oe.edition_id) then 'requested' else 'final' end,
            'partner:' || p_org_id::text, v_me)
    returning id into v_slot;
  exception when exclusion_violation then
    raise exception 'slot_overlap' using errcode = 'P0001', detail = p_start::text;
  end;

  insert into session (event_id, slot_id, format, title_de, language, access_mode, capacity,
                       partner_org_id, host_org_id, format_details, publish_status, created_by, updated_by)
  values (v_stage.event_id, v_slot, p_format, btrim(p_title_de), 'de', 'application',
          -- Einzelgespräch heißt eine Person je Slot; beim Gruppengespräch entscheidet der
          -- Partner (Konrad, D1). Ohne Angabe gilt Einzelgespräch.
          case when p_format = 'interview_table'
               then case when coalesce(v_details->>'interview_mode', 'single') = 'single'
                         then 1 else coalesce(p_capacity, 1) end
               else p_capacity end,
          p_org_id, p_org_id, v_details,
          case when session_needs_release(v_oe.edition_id) then 'review' else 'draft' end,
          v_me, v_me)
  returning id into v_id;

  perform log_audit('partner.session_create', 'session', v_id::text, null,
                    jsonb_build_object('org_id', p_org_id, 'format', p_format, 'slot_id', v_slot));
  return v_id;
end $$;

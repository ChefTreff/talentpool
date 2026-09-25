-- 0179 · Standbühne: Zeitfenster und Partner-Status (PART-079, PART-080)
-- Angewendet von der Architektur-Session am 25.09.2026 als 20260925070346.
--
-- **Ohne Nummer** (Regel vom 24.09.): die Architektur-Session vergibt sie beim Anwenden.
--
-- Anlass: Konrad, Runde 21.09. (Arbeitsauftrag „Freigabe nach der Pause" → Partner, Punkt 3).
--   PART-079 „Beliebige Zeiten möglich → Partnerbühne frühestens 90 Minuten nach Öffnung, letzter
--            Slot endet 19:00; Zeiten im Board fest markiert (Quelle stage_day.open_from/open_to,
--            Regel serverseitig)"
--   PART-080 „Der interne Slot-Status passt nicht für Partner → eigener Partner-Status: Offen, In
--            Bearbeitung, Veröffentlichen (mit Warnung: der Slot geht ins offizielle Programm); die
--            interne Freigabe durch die Programmleitung bleibt davor (LEAD-022, PART-050)"
--
-- **PART-079 — wo die Regel sitzt.** Slots auf der Standbühne legt der Partner im Board an
-- (`create_slot`, `move_slot`; LEAD-016 `editableStageIds`). Der Tagesrahmen aus LEAD-016 bindet
-- dort nur Stage Leads (`stage_frame_binds` prüft `speaker_manager`) — für Partner galt bisher gar
-- keine Grenze. Neu, **zusätzlich** zum Tagesrahmen: auf einer Bühne vom Typ `partner_booth` mit
-- Partner-Organisation gilt für alle ausser Admin und Programm-Team das Fenster
-- `open_from + 90 Minuten` bis `least(open_to, 19:00)`; ohne `stage_day`-Zeile nur das Ende 19:00.
-- Andere Partner-Flächen (Interview Tables, Side-Event-Orte) betrifft das nicht. Beide Funktionen
-- wortgleich aus dem Snapshot, eingefügt ist nur der Block `partner_window_binds` — in `move_slot`
-- **nach** den Warnungen zum Tagesrahmen, weil die an `found` der `stage_day`-Abfrage hängen.
-- Fehlerschlüssel P0001 `outside_partner_window`, detail `HH:MI–HH:MI`. Die Markierung der Zeiten im
-- Board ist Sache des Speaker-Chats (Bedarf über die Architektur-Session).
--
-- **PART-080 — Partner-Status.** Aus Sicht des Partners: Offen (Slot ohne Session), In Bearbeitung
-- (`draft`), Veröffentlichen angefragt (`review`), Veröffentlicht (`published`), Zurückgegeben
-- (`draft` mit Grund, PART-083). „Veröffentlichen" ist die **Anfrage** an die Programmleitung, keine
-- Freigabe: `partner_request_publish` setzt `review`, die Freigabe bleibt `release_partner_session`.
-- Sessions auf der Standbühne entstehen im Board nur mit `host_org_id`; die Freigabeliste
-- (`partner_sessions_pending`) findet aber nur Sessions mit `partner_org_id`. Die Anfrage setzt
-- deshalb `partner_org_id` auf die Organisation der Bühne, wenn es fehlt. Vorher prüft sie
-- dieselben Bedingungen wie die Freigabe (Slot, Titel DE und EN, eine Beschreibung) und meldet,
-- was fehlt — eine Anfrage, die die Programmleitung nur zurückgeben könnte, soll gar nicht erst
-- entstehen. `partner_withdraw_publish` nimmt eine noch nicht freigegebene Anfrage zurück.

set search_path = public, extensions;

-- ---------------------------------------------------------------- 1) Helfer (intern)

-- Das Fenster einer Standbühne an einem Tag. Ohne Öffnungszeit keine untere Grenze.
create or replace function partner_booth_window(p_stage_id uuid, p_event_day_id uuid)
 returns table (von time, bis time)
 language sql
 stable
 security definer
 set search_path = public, extensions
as $$
  select case when sd.open_from is not null then (sd.open_from + interval '90 minutes')::time end,
         least(coalesce(sd.open_to, time '19:00'), time '19:00')
    from stage st
    left join stage_day sd on sd.stage_id = st.id and sd.event_day_id = p_event_day_id
   where st.id = p_stage_id and st.type = 'partner_booth'
$$;

-- Bindet das Fenster? Auf einer Standbühne mit Partner-Organisation für alle ausser Admin und
-- Programm-Team (dieselbe Ausnahme wie beim Tagesrahmen, `stage_frame_binds`).
create or replace function partner_window_binds(p_stage_id uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path = public, extensions
as $$
  select exists (select 1 from stage st
                  where st.id = p_stage_id and st.type = 'partner_booth' and st.partner_org_id is not null)
     and not exists (
       select 1
         from stage st
         join event ev on ev.id = st.event_id
         join active_roles() ra on true
        where st.id = p_stage_id
          and ra.role in ('admin', 'programme_team')
          and (ra.scope_type = 'global'
               or (ra.scope_type = 'edition' and ra.edition_id in (ev.id, ev.edition_id))))
$$;
revoke execute on function partner_booth_window(uuid, uuid) from public, anon, authenticated;
revoke execute on function partner_window_binds(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- 2) Board-Funktionen (Live-Fassung aus dem Snapshot)

-- Slot anlegen: Fenster der Standbühne für Partner (PART-079).
create or replace function create_slot(p_stage_id uuid, p_start timestamp with time zone, p_end timestamp with time zone, p_slot_type text DEFAULT 'content'::text, p_session_id uuid DEFAULT NULL::uuid, p_source_ref text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_stage stage%rowtype;
  v_tz    text;
  v_day   event_day%rowtype;
  v_sd    stage_day%rowtype;
  v_id    uuid;
  v_win   record;
begin
  if not can_edit_stage(p_stage_id) then
    raise exception 'not allowed on this stage' using errcode = '42501';
  end if;
  if p_end <= p_start then
    raise exception 'end must be after start' using errcode = '22023';
  end if;
  select * into v_stage from stage where id = p_stage_id;
  select timezone into v_tz from event where id = v_stage.event_id;
  select * into v_day from event_day
    where event_id = v_stage.event_id and day_date = (p_start at time zone v_tz)::date;
  if not found then
    raise exception 'no event day for % on this stage', p_start using errcode = '22023';
  end if;

  -- Tagesrahmen (LEAD-016): für Stage Leads hart, für das Programm-Team eine
  -- Warnung wie bisher. Ohne Rahmen keine Grenze (siehe Kopf).
  select * into v_sd from stage_day where stage_id = p_stage_id and event_day_id = v_day.id;
  if found and stage_frame_binds(p_stage_id) and (
       (v_sd.open_from is not null and (p_start at time zone v_tz)::time < v_sd.open_from)
    or (v_sd.open_to   is not null and (p_end   at time zone v_tz)::time > v_sd.open_to)) then
    raise exception 'outside_stage_day' using errcode = 'P0001',
      detail = coalesce(to_char(v_sd.open_from, 'HH24:MI'), '') || '–' || coalesce(to_char(v_sd.open_to, 'HH24:MI'), '');
  end if;
  -- PART-079: Standbühne eines Partners — frühestens 90 Minuten nach Öffnung des Tages, der letzte
  -- Slot endet spätestens 19:00. Für den Partner hart; das Programm-Team darf abweichen.
  if partner_window_binds(p_stage_id) then
    select * into v_win from partner_booth_window(p_stage_id, v_day.id);
    if (v_win.von is not null and (p_start at time zone v_tz)::time < v_win.von)
       or (p_end at time zone v_tz)::time > v_win.bis then
      raise exception 'outside_partner_window' using errcode = 'P0001',
        detail = coalesce(to_char(v_win.von, 'HH24:MI'), '') || '–' || to_char(v_win.bis, 'HH24:MI');
    end if;
  end if;
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, source_ref, created_by, updated_by)
    values (p_stage_id, v_day.id, p_start, p_end, p_slot_type, p_source_ref, current_person_id(), current_person_id())
    returning id into v_id;
  if p_session_id is not null then
    update session set slot_id = v_id
      where id = p_session_id and slot_id is null and event_id = v_stage.event_id;
    if not found then
      raise exception 'session not attachable (already placed or other event)' using errcode = '22023';
    end if;
  end if;
  insert into slot_history (slot_id, changed_by, action, after)
    values (v_id, current_person_id(), 'create',
            jsonb_build_object('stage_id', p_stage_id, 'start_at', p_start, 'end_at', p_end, 'session_id', p_session_id));
  perform log_audit('slot.create', 'slot', v_id::text, null,
                    jsonb_build_object('stage_id', p_stage_id, 'start_at', p_start, 'end_at', p_end));
  return v_id;
end $$;

-- Slot verschieben: dasselbe Fenster, nach den Warnungen zum Tagesrahmen (die hängen an `found`).
create or replace function move_slot(p_slot_id uuid, p_stage_id uuid, p_start timestamp with time zone, p_end timestamp with time zone, p_confirm boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_slot      slot%rowtype;
  v_stage     stage%rowtype;
  v_tz        text;
  v_day       event_day%rowtype;
  v_sd        stage_day%rowtype;
  v_warn      text[] := '{}';
  v_published boolean;
  v_before    jsonb;
  v_after     jsonb;
  v_win       record;
begin
  select * into v_slot from slot where id = p_slot_id for update;
  if not found then
    raise exception 'slot not found' using errcode = 'P0002';
  end if;
  if not can_edit_slot(p_slot_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_end <= p_start then
    raise exception 'end must be after start' using errcode = '22023';
  end if;
  if v_slot.slot_type in ('fixed_block','frame') and not (is_admin() or has_role('programme_team')) then
    raise exception 'fixed blocks can only be moved by the programme team' using errcode = '42501';
  end if;
  if p_stage_id <> v_slot.stage_id and not can_edit_stage(p_stage_id) then
    raise exception 'not allowed on target stage' using errcode = '42501';
  end if;
  select * into v_stage from stage where id = p_stage_id;
  if not found then
    raise exception 'stage not found' using errcode = 'P0002';
  end if;
  select timezone into v_tz from event where id = v_stage.event_id;
  select * into v_day from event_day
    where event_id = v_stage.event_id and day_date = (p_start at time zone v_tz)::date;
  if not found then
    raise exception 'no event day for % on this stage', p_start using errcode = '22023';
  end if;
  select exists (select 1 from session se where se.slot_id = p_slot_id and se.publish_status = 'published')
    into v_published;
  if v_published and not p_confirm then
    raise exception 'confirmation_required'
      using errcode = 'P0001', hint = 'Slot ist veröffentlicht. Verschieben nur mit Bestätigung.';
  end if;
  select * into v_sd from stage_day where stage_id = p_stage_id and event_day_id = v_day.id;
  -- Tagesrahmen (LEAD-016): für Stage Leads hart, für das Programm-Team eine
  -- Warnung wie bisher. Ohne Rahmen keine Grenze (siehe Kopf).
  if found and stage_frame_binds(p_stage_id) and (
       (v_sd.open_from is not null and (p_start at time zone v_tz)::time < v_sd.open_from)
    or (v_sd.open_to   is not null and (p_end   at time zone v_tz)::time > v_sd.open_to)) then
    raise exception 'outside_stage_day' using errcode = 'P0001',
      detail = coalesce(to_char(v_sd.open_from, 'HH24:MI'), '') || '–' || coalesce(to_char(v_sd.open_to, 'HH24:MI'), '');
  end if;
  if found then
    if v_sd.open_from is not null and (p_start at time zone v_tz)::time < v_sd.open_from then
      v_warn := array_append(v_warn, 'before_open');
    end if;
    if v_sd.open_to is not null and (p_end at time zone v_tz)::time > v_sd.open_to then
      v_warn := array_append(v_warn, 'after_close');
    end if;
  end if;
  -- PART-079: Standbühne eines Partners — frühestens 90 Minuten nach Öffnung des Tages, der letzte
  -- Slot endet spätestens 19:00. Für den Partner hart; das Programm-Team darf abweichen.
  if partner_window_binds(p_stage_id) then
    select * into v_win from partner_booth_window(p_stage_id, v_day.id);
    if (v_win.von is not null and (p_start at time zone v_tz)::time < v_win.von)
       or (p_end at time zone v_tz)::time > v_win.bis then
      raise exception 'outside_partner_window' using errcode = 'P0001',
        detail = coalesce(to_char(v_win.von, 'HH24:MI'), '') || '–' || to_char(v_win.bis, 'HH24:MI');
    end if;
  end if;
  if extract(epoch from p_start)::bigint % 300 <> 0 or extract(epoch from p_end)::bigint % 300 <> 0 then
    v_warn := array_append(v_warn, 'off_grid_5min');
  end if;
  if v_stage.changeover_min > 0 and exists (
      select 1 from slot o
      where o.stage_id = p_stage_id and o.id <> p_slot_id and o.slot_type <> 'frame'
        and (
             (o.start_at >= p_end   and o.start_at <  p_end   + make_interval(mins => v_stage.changeover_min))
          or (o.end_at   <= p_start and o.end_at   >  p_start - make_interval(mins => v_stage.changeover_min))
        )
  ) then
    v_warn := array_append(v_warn, 'changeover_short');
  end if;
  if exists (
    select 1
    from session se
    join session_speaker ss on ss.session_id = se.id
    where se.slot_id = p_slot_id
      and exists (
        select 1
        from session_speaker ss2
        join session se2 on se2.id = ss2.session_id
        join slot sl2 on sl2.id = se2.slot_id
        where ss2.person_id = ss.person_id and se2.id <> se.id
          and tstzrange(sl2.start_at, sl2.end_at, '[)') && tstzrange(p_start, p_end, '[)')
      )
  ) then
    v_warn := array_append(v_warn, 'speaker_conflict');
  end if;
  v_before := jsonb_build_object('stage_id', v_slot.stage_id, 'event_day_id', v_slot.event_day_id,
                                 'start_at', v_slot.start_at, 'end_at', v_slot.end_at);
  v_after  := jsonb_build_object('stage_id', p_stage_id, 'event_day_id', v_day.id,
                                 'start_at', p_start, 'end_at', p_end);
  update slot
     set stage_id = p_stage_id, event_day_id = v_day.id, start_at = p_start, end_at = p_end,
         updated_by = current_person_id()
   where id = p_slot_id;
  insert into slot_history (slot_id, changed_by, action, before, after, reason)
    values (p_slot_id, current_person_id(), 'move', v_before, v_after,
            case when v_published then 'confirmed_after_publish' end);
  perform log_audit('slot.move', 'slot', p_slot_id::text, v_before, v_after);
  return jsonb_build_object('ok', true, 'warnings', to_jsonb(v_warn));
end $$;

-- ---------------------------------------------------------------- 3) Partner-Status (PART-080)

-- „Veröffentlichen": Anfrage an die Programmleitung. Gibt den Stand danach zurück.
create or replace function partner_request_publish(p_session_id uuid)
 returns text
 language plpgsql
 security definer
 set search_path = public, extensions
as $$
declare v_se session; v_stage stage; v_fehlt text[];
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_se from session where id = p_session_id for update;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  select st.* into v_stage from slot sl join stage st on st.id = sl.stage_id where sl.id = v_se.slot_id;
  -- Nur Sessions auf der eigenen Standbühne, mit dem Recht des Boards auf diesen Slot.
  if v_stage.id is null or v_stage.type <> 'partner_booth' or v_stage.partner_org_id is null
     or not coalesce(can_edit_slot(v_se.slot_id), false)
     or (v_se.host_org_id is not null and v_se.host_org_id <> v_stage.partner_org_id)
     or (v_se.partner_org_id is not null and v_se.partner_org_id <> v_stage.partner_org_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_se.publish_status in ('review', 'published') then return v_se.publish_status; end if;
  if v_se.publish_status <> 'draft' then
    raise exception 'not_editable' using errcode = 'P0001', detail = v_se.publish_status;
  end if;
  -- Dieselben Bedingungen wie bei der Freigabe (`release_partner_session`) — vorher, mit Namen.
  v_fehlt := array_remove(array[
    case when nullif(btrim(coalesce(v_se.title_de, '')), '') is null then 'title_de' end,
    case when nullif(btrim(coalesce(v_se.title_en, '')), '') is null then 'title_en' end,
    case when coalesce(nullif(btrim(coalesce(v_se.description_de, '')), ''),
                       nullif(btrim(coalesce(v_se.description_en, '')), '')) is null
         then 'description_de|description_en' end
  ], null);
  if cardinality(v_fehlt) > 0 then
    raise exception 'fields_required' using errcode = '22023', detail = array_to_string(v_fehlt, ', ');
  end if;
  update session
     set publish_status = 'review',
         -- Ohne Partner an der Session fände die Freigabeliste sie nicht (`partner_sessions_pending`).
         partner_org_id = coalesce(partner_org_id, v_stage.partner_org_id),
         updated_by = current_person_id()
   where id = p_session_id;
  perform log_audit('partner.session_publish_requested', 'session', p_session_id::text,
                    jsonb_build_object('publish_status', v_se.publish_status),
                    jsonb_build_object('publish_status', 'review', 'org_id', v_stage.partner_org_id));
  return 'review';
end $$;

-- Anfrage zurücknehmen, solange die Programmleitung sie nicht freigegeben hat.
create or replace function partner_withdraw_publish(p_session_id uuid)
 returns text
 language plpgsql
 security definer
 set search_path = public, extensions
as $$
declare v_se session; v_stage stage;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_se from session where id = p_session_id for update;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  select st.* into v_stage from slot sl join stage st on st.id = sl.stage_id where sl.id = v_se.slot_id;
  if v_stage.id is null or v_stage.type <> 'partner_booth' or v_stage.partner_org_id is null
     or not coalesce(can_edit_slot(v_se.slot_id), false)
     or (v_se.partner_org_id is not null and v_se.partner_org_id <> v_stage.partner_org_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_se.publish_status <> 'review' then return v_se.publish_status; end if;
  update session set publish_status = 'draft', updated_by = current_person_id() where id = p_session_id;
  perform log_audit('partner.session_publish_withdrawn', 'session', p_session_id::text,
                    jsonb_build_object('publish_status', 'review'), jsonb_build_object('publish_status', 'draft'));
  return 'draft';
end $$;

select harden_definer_functions();

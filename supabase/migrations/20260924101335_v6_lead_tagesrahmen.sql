-- 0153 · Welle 6 · Tagesrahmen für Stage Leads (LEAD-016): create_slot/move_slot weisen speaker_manager außerhalb stage_day hart ab
-- Angewendet von der Architektur-Session am 24.09.2026 als 20260924101335.
--
-- Vorschlag der Build-Session Speaker-Domäne. Nummer, Anwenden, Umbenennen und
-- der Eintrag ins Entscheidungslog gehören der Architektur-Session.
--
-- Anlass: Konrad am 24.09. — „Die Speaker Leads dürfen die Slots ihrer Bühne
-- im Rahmen des Tages (also Startzeit und Endzeit fest) bearbeiten."
--
-- **Heute ist der Rahmen nur ein Hinweis.** `move_slot` meldet `before_open`
-- und `after_close` als Warnung und verschiebt trotzdem; `create_slot` prüft
-- gar nichts. Für eine Stage-Lead-Rolle, die Konrad ausdrücklich auf den
-- Tagesrahmen begrenzt, reicht ein Hinweis nicht — sonst wäre die Grenze eine
-- Bitte.
--
-- **Hart nur für die, die es betrifft.** Wer die Bühne als `speaker_manager`
-- mit Stage-Scope bearbeitet und **nicht** zugleich admin oder programme_team
-- dieser Edition ist, wird ausserhalb von `stage_day.open_from`/`open_to`
-- abgewiesen. Das Programm-Team behält die Warnung: es verschiebt auch einmal
-- bewusst über den Rahmen hinaus, und das soll es weiter können.
--
-- **Ohne Rahmen keine Grenze.** Fehlt die `stage_day`-Zeile oder eine der
-- beiden Zeiten, gibt es nichts, woran geprüft werden könnte — dann gilt, was
-- heute gilt. Eine Grenze zu erfinden wäre schlimmer als keine.
--
-- `standbuehne_editor` (Partner) ist bewusst **nicht** erfasst: für Partner gilt
-- ein eigenes, engeres Zeitfenster (PART-078…, 90 Minuten nach Öffnung bis
-- 19:00), das der Partner-Chat auf dem Board-Kern aufsetzt.
--
-- Beide Funktionen aus `supabase/snapshot/functions/`; neu ist je nur der
-- Block „Tagesrahmen".
--
-- Fehlerschlüssel: P0001 `outside_stage_day` (detail: `HH:MI–HH:MI`, so wie die
-- Oberfläche ihn in Klammern hinter die Meldung setzt).

set search_path = public, extensions;

/**
 * Bindet der Tagesrahmen dieser Bühne den Aufrufer?
 *
 * Ja, wenn er dort `speaker_manager` mit Stage-Scope ist und **nicht** admin
 * oder programme_team der Edition. `coalesce`, damit aus NULL nie „nein, frei"
 * wird (Lehre aus 0118) — im Zweifel greift die Grenze.
 */
create or replace function stage_frame_binds(p_stage_id uuid)
returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select coalesce(
    exists (select 1 from active_roles() ra
             where ra.role = 'speaker_manager' and ra.scope_type = 'stage' and ra.scope_id = p_stage_id)
    and not exists (
      select 1
        from stage st
        join event ev on ev.id = st.event_id
        join active_roles() ra on true
       where st.id = p_stage_id
         and ra.role in ('admin', 'programme_team')
         and (ra.scope_type = 'global'
              or (ra.scope_type = 'edition' and ra.edition_id in (ev.id, ev.edition_id)))),
    true)
$$;

revoke all on function stage_frame_binds(uuid) from public, anon;
grant execute on function stage_frame_binds(uuid) to authenticated;

-- ---- create_slot
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

-- ---- move_slot
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

select harden_definer_functions();

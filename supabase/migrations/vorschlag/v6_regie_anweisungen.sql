-- Vorschlag ohne Nummer · Welle 6 · Regieanweisungen der Stage Leads als Liste; Regieplan nur intern (LEAD-031)
--
-- Vorschlag der Build-Session Speaker-Domäne. Nummer, Anwenden, Umbenennen und
-- der Eintrag ins Entscheidungslog gehören der Architektur-Session.
--
-- Anlass: Konrad am 24.09. (LEAD-031, P1): Stage Leads landeten auf der
-- Regieseite der Produktion. Sie brauchen **jeden Slot der eigenen Bühnen als
-- Liste**, die Regieanweisungen (Mikro, Mobiliar, Absprachen — LEAD-012) direkt
-- bearbeitbar, **keine neuen Slots, keine Zeiten**; Produktion und Admin können
-- überschreiben; der eigentliche Regieplan (Auf- und Abgang) bleibt bei der
-- Produktion.
--
-- Befund: `upsert_regie_cue` und `delete_regie_cue` prüften `can_edit_regie` =
-- `is_production_team() or can_edit_stage()`. `can_edit_stage` gilt auch für
-- `speaker_manager`/`standbuehne_editor` mit Bühnen-Scope — externe Stage Leads
-- konnten also Cues anlegen, verschieben und löschen, also den Plan der
-- Produktion ändern. Das schliesst dieser Vorschlag.
--
-- Neu:
--   * `can_plan_regie(stage)`: Produktion (`is_production_team`) oder das
--     interne Team mit Recht an der Edition (`admin`, `programme_team` — der
--     Abschnitt `/admin/regie` steht auch dem Programm-Team offen).
--     `upsert_regie_cue` und `delete_regie_cue` prüfen das statt `can_edit_regie`.
--   * `set_regie_anweisungen(slot, data)`: nur die Anweisungen — Personen auf der
--     Bühne, Mikrofon, Präsentation und Medien, Mobiliar, Absprachen — für jeden,
--     der `can_edit_regie` an der Bühne hat (Produktion, Admin, Stage Leads). Gibt
--     es zum Slot noch keinen Cue, entsteht einer **mit den Zeiten des Slots**;
--     Zeiten und Ablauf sind hier nicht schreibbar (P0001 `not_editable`).
--     Mikrofon und Medien stehen als `{"text": …}` in `mic_assignments` bzw.
--     `media` (jsonb, bisher von keiner Oberfläche beschrieben); andere Schlüssel
--     darin bleiben erhalten.
--   * `lead_regie_slots()`: alle Slots (ohne Rahmen) der Bühnen, an denen man
--     Regie machen darf, über alle Tage, mit Session, Speakern, Technik-Ansage
--     und den Anweisungen aus dem ersten Cue des Slots.
--
-- Funktionen aus `supabase/snapshot/functions/`: `upsert_regie_cue`,
-- `delete_regie_cue`; neu: `can_plan_regie`, `set_regie_anweisungen`,
-- `lead_regie_slots`. Fehlerschlüssel: P0002 `slot_not_found`, P0001
-- `not_editable` (beide schon im Wörterbuch).

set search_path = public, extensions;

-- ---- 1 · Wer den Regieplan schreibt
create or replace function can_plan_regie(p_stage_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select is_production_team() or exists (
    select 1
      from stage st
      join event ev on ev.id = st.event_id
      join active_roles() ra on true
     where st.id = p_stage_id
       and ra.role in ('admin', 'programme_team')
       and (ra.scope_type = 'global'
            or (ra.scope_type = 'edition' and ra.edition_id in (ev.id, ev.edition_id))))
$$;

-- ---- 2 · upsert_regie_cue (Plan)
create or replace function upsert_regie_cue(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_id uuid; v_stage uuid; v_day uuid; v_start timestamptz; v_end timestamptz;
begin
  v_id := nullif(p_data->>'id', '')::uuid;
  v_stage := nullif(p_data->>'stage_id', '')::uuid;
  v_day := nullif(p_data->>'event_day_id', '')::uuid;
  v_start := nullif(p_data->>'cue_start', '')::timestamptz;
  v_end := nullif(p_data->>'cue_end', '')::timestamptz;

  -- Beim Ändern gilt die Bühne des Cues, nicht die im Aufruf: sonst liesse
  -- sich über eine fremde `stage_id` im Rumpf eine Zeile bewegen, für die
  -- man nicht zuständig ist.
  if v_id is not null then
    select c.stage_id, c.event_day_id into v_stage, v_day from regie_cue c where c.id = v_id;
    if v_stage is null then raise exception 'cue_not_found' using errcode = 'P0002'; end if;
  end if;
  if v_stage is null then
    raise exception 'invalid_cue' using errcode = '22023', detail = 'stage_id fehlt';
  end if;
  -- LEAD-031: Den Regieplan (Cues, Zeiten, Ablauf, Auf- und Abgang) führen die
  -- Produktion und das interne Team. Externe Stage Leads und Standbühnen
  -- schreiben ihre Anweisungen über `set_regie_anweisungen`, nicht den Plan.
  if not can_plan_regie(v_stage) then raise exception 'not allowed' using errcode = '42501'; end if;

  if v_id is null then
    if v_day is null or v_start is null or v_end is null then
      raise exception 'invalid_cue' using errcode = '22023',
        detail = 'stage_id, event_day_id, cue_start und cue_end sind Pflicht';
    end if;
    if not exists (select 1 from stage s join event_day d on d.event_id = s.event_id
                    where s.id = v_stage and d.id = v_day) then
      raise exception 'invalid_cue' using errcode = '22023',
        detail = 'Bühne und Tag gehören zu verschiedenen Veranstaltungen';
    end if;
    if nullif(p_data->>'slot_id', '') is not null and not exists (
         select 1 from slot sl where sl.id = (p_data->>'slot_id')::uuid
            and sl.stage_id = v_stage and sl.event_day_id = v_day) then
      raise exception 'invalid_cue' using errcode = '22023',
        detail = 'slot_id gehört nicht zu Bühne und Tag des Cues';
    end if;
    insert into regie_cue (stage_id, event_day_id, slot_id, cue_start, cue_end, sort_order,
                           action, umbau_min, moderation, regie, backstage, mobiliar, notes,
                           people_on_stage, mic_assignments, media, created_by, updated_by)
    values (v_stage, v_day, nullif(p_data->>'slot_id', '')::uuid, v_start, v_end,
            coalesce((p_data->>'sort_order')::integer, 0),
            coalesce(nullif(btrim(p_data->>'action'), ''), '—'),
            nullif(p_data->>'umbau_min', '')::integer,
            nullif(p_data->>'moderation', ''), nullif(p_data->>'regie', ''),
            nullif(p_data->>'backstage', ''), nullif(p_data->>'mobiliar', ''),
            nullif(p_data->>'notes', ''), nullif(p_data->>'people_on_stage', ''),
            coalesce(p_data->'mic_assignments', '{}'::jsonb),
            coalesce(p_data->'media', '{}'::jsonb),
            current_person_id(), current_person_id())
    returning id into v_id;
  else
    if p_data ? 'slot_id' and nullif(p_data->>'slot_id', '') is not null then
      if not exists (select 1 from slot sl where sl.id = (p_data->>'slot_id')::uuid
                        and sl.stage_id = v_stage and sl.event_day_id = v_day) then
        raise exception 'invalid_cue' using errcode = '22023',
          detail = 'slot_id gehört nicht zu Bühne und Tag des Cues';
      end if;
    end if;
    -- Teilupdate über die mitgeschickten Schlüssel: was fehlt, bleibt stehen.
    update regie_cue set
      slot_id = case when p_data ? 'slot_id' then nullif(p_data->>'slot_id', '')::uuid else slot_id end,
      cue_start = coalesce(v_start, cue_start),
      cue_end = coalesce(v_end, cue_end),
      sort_order = coalesce((p_data->>'sort_order')::integer, sort_order),
      action = coalesce(nullif(btrim(p_data->>'action'), ''), action),
      umbau_min = case when p_data ? 'umbau_min' then nullif(p_data->>'umbau_min', '')::integer else umbau_min end,
      moderation = case when p_data ? 'moderation' then nullif(p_data->>'moderation', '') else moderation end,
      regie = case when p_data ? 'regie' then nullif(p_data->>'regie', '') else regie end,
      backstage = case when p_data ? 'backstage' then nullif(p_data->>'backstage', '') else backstage end,
      mobiliar = case when p_data ? 'mobiliar' then nullif(p_data->>'mobiliar', '') else mobiliar end,
      notes = case when p_data ? 'notes' then nullif(p_data->>'notes', '') else notes end,
      people_on_stage = case when p_data ? 'people_on_stage'
                             then nullif(p_data->>'people_on_stage', '') else people_on_stage end,
      mic_assignments = coalesce(p_data->'mic_assignments', mic_assignments),
      media = coalesce(p_data->'media', media),
      updated_by = current_person_id(),
      updated_at = now()
    where id = v_id;
    if not found then raise exception 'cue_not_found' using errcode = 'P0002'; end if;
  end if;

  perform log_audit('regie.cue_saved', 'regie_cue', v_id::text, null, p_data);
  return v_id;
end $$;

-- ---- 3 · delete_regie_cue (Plan)
create or replace function delete_regie_cue(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_stage uuid;
begin
  select c.stage_id into v_stage from regie_cue c where c.id = p_id;
  if v_stage is null then raise exception 'cue_not_found' using errcode = 'P0002'; end if;
  -- LEAD-031: Den Regieplan (Cues, Zeiten, Ablauf, Auf- und Abgang) führen die
  -- Produktion und das interne Team. Externe Stage Leads und Standbühnen
  -- schreiben ihre Anweisungen über `set_regie_anweisungen`, nicht den Plan.
  if not can_plan_regie(v_stage) then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from regie_cue where id = p_id;
  perform log_audit('regie.cue_deleted', 'regie_cue', p_id::text, null, null);
end $$;

-- ---- 4 · Anweisungen je Slot
create or replace function set_regie_anweisungen(p_slot_id uuid, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_sl slot%rowtype; v_cue uuid; v_bad text; v_titel text;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_sl from slot where id = p_slot_id;
  if not found then raise exception 'slot_not_found' using errcode = 'P0002'; end if;
  if not can_edit_regie(v_sl.stage_id) then raise exception 'not allowed' using errcode = '42501'; end if;

  select string_agg(k, ',') into v_bad from jsonb_object_keys(coalesce(p_data, '{}'::jsonb)) k
   where k not in ('people_on_stage', 'mic', 'media', 'mobiliar', 'notes');
  if v_bad is not null then
    raise exception 'not_editable' using errcode = 'P0001', detail = v_bad;
  end if;

  -- Der erste Cue des Slots trägt die Anweisungen (wie in `lead_regie_slots`).
  select c.id into v_cue from regie_cue c
   where c.slot_id = p_slot_id
   order by c.cue_start, c.sort_order, c.created_at
   limit 1
   for update;

  if v_cue is null then
    select coalesce(se.title_de, se.title_en) into v_titel from session se where se.slot_id = p_slot_id limit 1;
    insert into regie_cue (stage_id, event_day_id, slot_id, cue_start, cue_end, action,
                           people_on_stage, mobiliar, notes, mic_assignments, media, created_by, updated_by)
    values (v_sl.stage_id, v_sl.event_day_id, v_sl.id, v_sl.start_at, v_sl.end_at, coalesce(v_titel, '—'),
            nullif(btrim(p_data->>'people_on_stage'), ''), nullif(btrim(p_data->>'mobiliar'), ''),
            nullif(btrim(p_data->>'notes'), ''),
            case when nullif(btrim(p_data->>'mic'), '') is null then '{}'::jsonb
                 else jsonb_build_object('text', btrim(p_data->>'mic')) end,
            case when nullif(btrim(p_data->>'media'), '') is null then '{}'::jsonb
                 else jsonb_build_object('text', btrim(p_data->>'media')) end,
            current_person_id(), current_person_id())
    returning id into v_cue;
    return v_cue;
  end if;

  -- Teilupdate über die mitgeschickten Schlüssel; Zeiten und Ablauf bleiben.
  update regie_cue set
    people_on_stage = case when p_data ? 'people_on_stage' then nullif(btrim(p_data->>'people_on_stage'), '') else people_on_stage end,
    mobiliar        = case when p_data ? 'mobiliar'        then nullif(btrim(p_data->>'mobiliar'), '')        else mobiliar end,
    notes           = case when p_data ? 'notes'           then nullif(btrim(p_data->>'notes'), '')           else notes end,
    mic_assignments = case when not p_data ? 'mic' then mic_assignments
                           when nullif(btrim(p_data->>'mic'), '') is null then mic_assignments - 'text'
                           else mic_assignments || jsonb_build_object('text', btrim(p_data->>'mic')) end,
    media           = case when not p_data ? 'media' then media
                           when nullif(btrim(p_data->>'media'), '') is null then media - 'text'
                           else media || jsonb_build_object('text', btrim(p_data->>'media')) end,
    updated_by      = current_person_id()
  where id = v_cue;
  return v_cue;
end $$;

-- ---- 5 · Liste der Slots für Stage Leads
create or replace function lead_regie_slots()
 RETURNS TABLE(slot_id uuid, stage_id uuid, stage_name text, event_day_id uuid, day_date date,
               start_at timestamp with time zone, end_at timestamp with time zone, slot_type text,
               session_id uuid, title text, format text, speakers jsonb, tech jsonb,
               cue_id uuid, people_on_stage text, mic text, media text, mobiliar text, notes text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return query
    select sl.id, st.id, st.name, d.id, d.day_date, sl.start_at, sl.end_at, sl.slot_type,
           se.id, coalesce(se.title_de, se.title_en), se.format,
           case when se.id is null then '[]'::jsonb else coalesce(session_speakers_public(se.id), '[]'::jsonb) end,
           coalesce(se.tech, '{}'::jsonb),
           c.id, c.people_on_stage, c.mic_assignments->>'text', c.media->>'text', c.mobiliar, c.notes
      from slot sl
      join stage st on st.id = sl.stage_id
      join event_day d on d.id = sl.event_day_id
      left join session se on se.slot_id = sl.id
      left join lateral (
        select c0.* from regie_cue c0 where c0.slot_id = sl.id
         order by c0.cue_start, c0.sort_order, c0.created_at limit 1) c on true
     where st.active
       and sl.slot_type <> 'frame'
       and can_edit_regie(st.id)
     order by d.day_date, st.sort_order, st.name, sl.start_at;
end $$;

select harden_definer_functions();

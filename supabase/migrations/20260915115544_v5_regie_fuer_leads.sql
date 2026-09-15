-- 0101 · Welle 5 · Regie auch für die Speaker-Leads (Konrad, 15.09.)
--
-- Angewendet von der Architektur-Session am 15.09.2026 nach Review.
--
-- Konrad zur Struktur der Speaker-Portale: „Wichtig ist, dass sie auch eine
-- Regieübersicht haben, wo sie Regieanweisungen für die Slots hinzufügen, die
-- dann wiederum als Liste für unsere Techniker und Stage Hands exportiert und
-- gedruckt werden können."
--
-- Bisher hing die Regie an `is_production_team()`. Das war richtig, solange sie
-- nur am Veranstaltungstag entsteht — aber die Anweisungen **entstehen vorher**,
-- bei der Person, die die Bühne programmiert. Die Produktion druckt sie aus.
--
-- **Keine neue Regel, sondern die vorhandene.** `can_edit_stage()` sagt seit
-- 0007 genau das Richtige: Admin und Programm-Team global oder je Edition,
-- `speaker_manager` je Bühne. Eine zweite Regel danebenzustellen hiesse, zwei
-- Wahrheiten darüber zu haben, wem eine Bühne gehört.
--
-- Geändert wird an den vier Funktionen **nur die Rechteprüfung**; die Rümpfe
-- sind unverändert aus 0082. Beim Schreiben wandert die Prüfung hinter die
-- Auflösung der Bühne — vorher weiss die Funktion gar nicht, worüber sie
-- entscheiden soll.
--
-- Fehlerschlüssel: unverändert (42501, 22023 `invalid_cue`, P0002 `cue_not_found`).

set search_path = public, extensions;

/**
 * Wer an der Regie einer Bühne arbeiten darf.
 *
 * Die Produktion für alle Bühnen — sie führt den Tag. Sonst gilt dieselbe
 * Regel wie fürs Programm: wer die Bühne bespielen darf, darf auch den
 * Ablaufplan schreiben.
 */
create or replace function can_edit_regie(p_stage_id uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select is_production_team() or can_edit_stage(p_stage_id)
$$;

comment on function can_edit_regie(uuid) is
  'Regie einer Bühne lesen und schreiben: Produktion überall, sonst `can_edit_stage` (Admin, Programm-Team, Speaker-Lead der Bühne).';

create or replace function regie_view(p_stage_id uuid, p_event_day_id uuid)
returns table(
  cue_id uuid, cue_start timestamptz, cue_end timestamptz, sort_order integer,
  action text, umbau_min integer, moderation text, regie text, backstage text,
  mobiliar text, notes text, mic_assignments jsonb, media jsonb,
  slot_id uuid, slot_status text, session_id uuid, title text, format text,
  speakers jsonb)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not can_edit_regie(p_stage_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select c.id, c.cue_start, c.cue_end, c.sort_order,
           c.action, c.umbau_min, c.moderation, c.regie, c.backstage,
           c.mobiliar, c.notes, c.mic_assignments, c.media,
           c.slot_id, sl.status, se.id,
           coalesce(se.title_de, se.title_en), se.format,
           case when se.id is null then '[]'::jsonb else session_speakers_public(se.id) end
      from regie_cue c
      left join slot sl on sl.id = c.slot_id
      left join session se on se.slot_id = sl.id
     where c.stage_id = p_stage_id and c.event_day_id = p_event_day_id
     order by c.cue_start, c.sort_order;
end $$;

create or replace function regie_open_slots(p_stage_id uuid, p_event_day_id uuid)
returns table(slot_id uuid, start_at timestamptz, end_at timestamptz, title text, format text)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not can_edit_regie(p_stage_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select sl.id, sl.start_at, sl.end_at, coalesce(se.title_de, se.title_en), se.format
      from slot sl
      left join session se on se.slot_id = sl.id
     where sl.stage_id = p_stage_id and sl.event_day_id = p_event_day_id
       and not exists (select 1 from regie_cue c where c.slot_id = sl.id)
     order by sl.start_at;
end $$;

create or replace function upsert_regie_cue(p_data jsonb) returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
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
  if not can_edit_regie(v_stage) then raise exception 'not allowed' using errcode = '42501'; end if;

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
                           mic_assignments, media, created_by, updated_by)
    values (v_stage, v_day, nullif(p_data->>'slot_id', '')::uuid, v_start, v_end,
            coalesce((p_data->>'sort_order')::integer, 0),
            coalesce(nullif(btrim(p_data->>'action'), ''), '—'),
            nullif(p_data->>'umbau_min', '')::integer,
            nullif(p_data->>'moderation', ''), nullif(p_data->>'regie', ''),
            nullif(p_data->>'backstage', ''), nullif(p_data->>'mobiliar', ''),
            nullif(p_data->>'notes', ''),
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

create or replace function delete_regie_cue(p_id uuid) returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_stage uuid;
begin
  select c.stage_id into v_stage from regie_cue c where c.id = p_id;
  if v_stage is null then raise exception 'cue_not_found' using errcode = 'P0002'; end if;
  if not can_edit_regie(v_stage) then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from regie_cue where id = p_id;
  perform log_audit('regie.cue_deleted', 'regie_cue', p_id::text, null, null);
end $$;

/**
 * Die Bühnen und Tage, an denen diese Person Regie machen darf.
 *
 * Damit die Auswahl im Lead-Portal nicht alles anbietet und erst beim Klick
 * mit 42501 antwortet — ein Menü, das ins Leere führt, ist schlechter als
 * eines, das kürzer ist.
 */
create or replace function my_regie_stages(p_edition_id uuid default null)
returns table (stage_id uuid, stage_name text, event_id uuid, edition_id uuid)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return query
    select st.id, st.name, st.event_id, coalesce(e.edition_id, e.id)
      from stage st join event e on e.id = st.event_id
     where st.active
       and (p_edition_id is null or coalesce(e.edition_id, e.id) = p_edition_id)
       and can_edit_regie(st.id)
     order by st.sort_order, st.name;
end $$;

select harden_definer_functions();

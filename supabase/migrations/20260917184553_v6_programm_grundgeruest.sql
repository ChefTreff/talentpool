-- =============================================================================
-- 0110 · Welle 6 · Das Programm-Grundgerüst wird pflegbar (M8)
--     Angewendet von der Architektur-Session am 17.09.2026 als 20260917184553
--
-- Befund aus `docs/abgleich/team-werkzeuge.md` (A1/A2) und der Feld-Matrix
-- (Befunde a): Tage, Bühnen, Bühne×Tag und Tracks **existieren als Tabellen**,
-- aber es gibt keinen einzigen Schreibweg über eine Seite. Die FLS27-Bühnen
-- stehen als `insert` in einer Seed-Migration von Anfang September. Wer 2027
-- eine Bühne umbenennt, eine dritte Halle dazunimmt oder den Einlass um eine
-- halbe Stunde vorzieht, braucht heute eine Entwicklerin.
--
-- Besonders eng ist es bei den Öffnungszeiten: `stage_day.open_from/open_to`
-- werden vom Programm-Board **erzwungen**, wenn jemand einen Slot verschiebt —
-- und niemand kann sie pflegen. Eine Regel, die gilt und die niemand ändern
-- kann, ist keine Regel, sondern ein Hindernis.
--
-- **Keine neuen Tabellen.** Das Datenmodell steht seit 0006; es fehlen
-- ausschliesslich Schreibwege. Diese Migration fügt sieben RPCs und eine
-- Leseliste hinzu, sonst nichts.
--
-- **Löschen ist die eigentliche Arbeit.** Anlegen kann jeder; die Frage ist,
-- was passiert, wenn an einer Bühne schon dreissig Slots hängen. Ein
-- Fremdschlüsselfehler („violates foreign key constraint") hilft niemandem.
-- Jede Löschfunktion prüft deshalb selbst und antwortet mit einem Schlüssel,
-- den die Oberfläche in einen Satz übersetzen kann — und `programme_skeleton`
-- liefert die Zahlen gleich mit, damit die Oberfläche warnen kann, **bevor**
-- jemand klickt.
--
-- **Rechte:** `is_programme_editor(event_id)` — Admin und Programm-Team,
-- global oder für diese Edition. Bewusst nicht jede Bereichsleitung: eine
-- Bühne zu löschen ist keine Kleinigkeit, und die Bereichsleitungen haben
-- ihre eigenen Portale.
--
-- Editionen selbst (`event`) bleiben aussen vor. Dort hängen die
-- Integrationsschlüssel (HubSpot-Pipeline, vivenu, Swapcard) und die
-- `is_edition`/`edition_id`-Beziehungen; das verdient eine eigene Runde und
-- klemmt im Alltag nicht.
--
-- Fehlerschlüssel: 42501 ohne Recht · 22023 `invalid_stage_type` ·
-- 22023 `invalid_times` (Öffnung endet vor dem Beginn) ·
-- P0002 `event_not_found` / `day_not_found` / `stage_not_found` / `track_not_found` ·
-- P0001 `in_use` (Detail nennt, was hängt: `slots:30`, `sessions:4`, `roles:2`).
--
-- **Ein Schlüssel für alle drei Löschwege** (Entscheidung Architektur-Session
-- 17.09.): die Oberfläche kennt die Zahlen ohnehin aus `programme_skeleton` und
-- kann den Satz selbst bilden; drei fast gleiche Wörterbucheinträge wären drei
-- Stellen, an denen die Formulierung auseinanderläuft.
--
-- Test: supabase/tests/v6_programm_grundgeruest.sql
-- =============================================================================
set search_path = public, extensions;

-- ---------------------------------------------------------------- Tage

/**
 * Veranstaltungstag anlegen oder ändern.
 *
 * `id` im Datensatz heisst ändern, kein `id` heisst anlegen — dasselbe Muster
 * wie `upsert_session`. Das Datum ist je Event eindeutig; ein zweiter Eintrag
 * für denselben Tag ändert den bestehenden, statt an der Unique-Regel zu
 * scheitern.
 */
create or replace function upsert_event_day(p_data jsonb) returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_id uuid := nullif(p_data->>'id', '')::uuid; v_event uuid; v_date date; v_before jsonb;
begin
  -- Vorherzustand fürs Protokoll: bei einer Änderung will man wissen, was
  -- vorher dastand, nicht nur was geschickt wurde.
  if v_id is not null then
    select ed.event_id into v_event from event_day ed where ed.id = v_id;
    if v_event is null then raise exception 'day_not_found' using errcode = 'P0002'; end if;
  else
    v_event := nullif(p_data->>'event_id', '')::uuid;
    if not exists (select 1 from event e where e.id = v_event) then
      raise exception 'event_not_found' using errcode = 'P0002';
    end if;
  end if;
  if not is_programme_editor(v_event) then raise exception 'not allowed' using errcode = '42501'; end if;

  if v_id is null then
    v_date := (p_data->>'day_date')::date;
    -- Derselbe Tag zweimal ist keine Eingabe, sondern ein zweiter Versuch.
    select ed.id into v_id from event_day ed where ed.event_id = v_event and ed.day_date = v_date;
  end if;

  select to_jsonb(ed) into v_before from event_day ed where ed.id = v_id;

  if v_id is null then
    insert into event_day (event_id, day_date, label_de, label_en, doors_open, programme_start, programme_end, sort_order)
    values (v_event, v_date,
            nullif(btrim(p_data->>'label_de'), ''), nullif(btrim(p_data->>'label_en'), ''),
            nullif(p_data->>'doors_open', '')::time, nullif(p_data->>'programme_start', '')::time,
            nullif(p_data->>'programme_end', '')::time,
            coalesce((p_data->>'sort_order')::integer, 0))
    returning id into v_id;
  else
    update event_day set
      day_date        = coalesce(nullif(p_data->>'day_date', '')::date, day_date),
      label_de        = case when p_data ? 'label_de' then nullif(btrim(p_data->>'label_de'), '') else label_de end,
      label_en        = case when p_data ? 'label_en' then nullif(btrim(p_data->>'label_en'), '') else label_en end,
      doors_open      = case when p_data ? 'doors_open' then nullif(p_data->>'doors_open', '')::time else doors_open end,
      programme_start = case when p_data ? 'programme_start' then nullif(p_data->>'programme_start', '')::time else programme_start end,
      programme_end   = case when p_data ? 'programme_end' then nullif(p_data->>'programme_end', '')::time else programme_end end,
      sort_order      = coalesce((p_data->>'sort_order')::integer, sort_order)
    where id = v_id;
  end if;

  perform log_audit('programme.day_upsert', 'event_day', v_id::text, v_before, p_data);
  return v_id;
end $$;

/**
 * Tag löschen — nur solange nichts daran hängt.
 *
 * Geprüft wird auch die **Rollenzuweisung**: `role_assignment.scope_id` trägt
 * keinen Fremdschlüssel, eine Bühnen-Tag-Rolle würde beim Löschen also stumm
 * ins Leere zeigen und irgendwann jemandem Rechte auf ein Nichts geben
 * (Hinweis Architektur-Session 17.09.).
 */
create or replace function delete_event_day(p_id uuid) returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_event uuid; v_n integer; v_before jsonb;
begin
  select ed.event_id, to_jsonb(ed) into v_event, v_before from event_day ed where ed.id = p_id;
  if v_event is null then raise exception 'day_not_found' using errcode = 'P0002'; end if;
  if not is_programme_editor(v_event) then raise exception 'not allowed' using errcode = '42501'; end if;

  select count(*)::integer into v_n from slot s where s.event_day_id = p_id;
  if v_n > 0 then raise exception 'in_use' using errcode = 'P0001', detail = 'slots:' || v_n; end if;
  select count(*)::integer into v_n from role_assignment ra
   where ra.scope_type = 'stage_day'
     and ra.scope_id in (select sd.id from stage_day sd where sd.event_day_id = p_id);
  if v_n > 0 then raise exception 'in_use' using errcode = 'P0001', detail = 'roles:' || v_n; end if;

  delete from event_day where id = p_id;
  perform log_audit('programme.day_delete', 'event_day', p_id::text, v_before, null);
end $$;

-- ---------------------------------------------------------------- Bühnen

create or replace function upsert_stage(p_data jsonb) returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_id uuid := nullif(p_data->>'id', '')::uuid; v_event uuid; v_type text; v_before jsonb;
begin
  if v_id is not null then
    select st.event_id into v_event from stage st where st.id = v_id;
    if v_event is null then raise exception 'stage_not_found' using errcode = 'P0002'; end if;
  else
    v_event := nullif(p_data->>'event_id', '')::uuid;
    if not exists (select 1 from event e where e.id = v_event) then
      raise exception 'event_not_found' using errcode = 'P0002';
    end if;
  end if;
  if not is_programme_editor(v_event) then raise exception 'not allowed' using errcode = '42501'; end if;

  v_type := nullif(p_data->>'type', '');
  if v_type is not null and v_type not in ('main', 'side', 'partner_booth', 'room') then
    raise exception 'invalid_stage_type' using errcode = '22023', detail = v_type;
  end if;

  select to_jsonb(st) into v_before from stage st where st.id = v_id;

  if v_id is null then
    insert into stage (event_id, name, slug, type, room, capacity, partner_org_id, stage_lead_person_id,
                       changeover_min, default_duration_min, partner_slot_quota, sort_order, active)
    values (v_event, btrim(p_data->>'name'), nullif(btrim(p_data->>'slug'), ''), coalesce(v_type, 'side'),
            nullif(btrim(p_data->>'room'), ''), (p_data->>'capacity')::integer,
            nullif(p_data->>'partner_org_id', '')::uuid, nullif(p_data->>'stage_lead_person_id', '')::uuid,
            coalesce((p_data->>'changeover_min')::integer, 0),
            coalesce((p_data->>'default_duration_min')::integer, 30),
            (p_data->>'partner_slot_quota')::integer,
            coalesce((p_data->>'sort_order')::integer, 0),
            coalesce((p_data->>'active')::boolean, true))
    returning id into v_id;
  else
    update stage set
      name                 = coalesce(nullif(btrim(p_data->>'name'), ''), name),
      slug                 = case when p_data ? 'slug' then nullif(btrim(p_data->>'slug'), '') else slug end,
      type                 = coalesce(v_type, type),
      room                 = case when p_data ? 'room' then nullif(btrim(p_data->>'room'), '') else room end,
      capacity             = case when p_data ? 'capacity' then (p_data->>'capacity')::integer else capacity end,
      partner_org_id       = case when p_data ? 'partner_org_id' then nullif(p_data->>'partner_org_id', '')::uuid else partner_org_id end,
      stage_lead_person_id = case when p_data ? 'stage_lead_person_id' then nullif(p_data->>'stage_lead_person_id', '')::uuid else stage_lead_person_id end,
      changeover_min       = coalesce((p_data->>'changeover_min')::integer, changeover_min),
      default_duration_min = coalesce((p_data->>'default_duration_min')::integer, default_duration_min),
      partner_slot_quota   = case when p_data ? 'partner_slot_quota' then (p_data->>'partner_slot_quota')::integer else partner_slot_quota end,
      sort_order           = coalesce((p_data->>'sort_order')::integer, sort_order),
      active               = coalesce((p_data->>'active')::boolean, active)
    where id = v_id;
  end if;

  perform log_audit('programme.stage_upsert', 'stage', v_id::text, v_before, p_data);
  return v_id;
end $$;

/**
 * Bühne löschen — nur solange kein Slot daran hängt.
 *
 * Wer eine Bühne aus dem Programm nehmen will, an der schon etwas steht,
 * schaltet sie auf `active = false`. Das ist der Weg, den die Oberfläche
 * anbietet; gelöscht wird nur, was nie benutzt wurde.
 */
create or replace function delete_stage(p_id uuid) returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_event uuid; v_n integer; v_before jsonb;
begin
  select st.event_id, to_jsonb(st) into v_event, v_before from stage st where st.id = p_id;
  if v_event is null then raise exception 'stage_not_found' using errcode = 'P0002'; end if;
  if not is_programme_editor(v_event) then raise exception 'not allowed' using errcode = '42501'; end if;

  select count(*)::integer into v_n from slot s where s.stage_id = p_id;
  if v_n > 0 then raise exception 'in_use' using errcode = 'P0001', detail = 'slots:' || v_n; end if;
  -- Bühnen-Rollen (`standbuehne_editor`, `speaker_manager` im Bühnen-Scope)
  -- hängen ohne Fremdschlüssel an der ID — siehe Kommentar bei `delete_event_day`.
  select count(*)::integer into v_n from role_assignment ra
   where (ra.scope_type = 'stage' and ra.scope_id = p_id)
      or (ra.scope_type = 'stage_day'
          and ra.scope_id in (select sd.id from stage_day sd where sd.stage_id = p_id));
  if v_n > 0 then raise exception 'in_use' using errcode = 'P0001', detail = 'roles:' || v_n; end if;

  delete from stage where id = p_id;
  perform log_audit('programme.stage_delete', 'stage', p_id::text, v_before, null);
end $$;

-- ---------------------------------------------------------------- Bühne × Tag

/**
 * Öffnungszeiten und Kontingent je Bühne und Tag.
 *
 * Das ist die Zeile, die das Programm-Board beim Verschieben prüft. Bis hierher
 * gab es sie nur als Datensatz ohne Pflegeort — deshalb legt diese Funktion
 * fehlende Zeilen auch an, statt ein `stage_day` vorauszusetzen, das niemand
 * erzeugen konnte.
 */
create or replace function upsert_stage_day(p_data jsonb) returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_stage uuid := nullif(p_data->>'stage_id', '')::uuid;
        v_day uuid := nullif(p_data->>'event_day_id', '')::uuid;
        v_event uuid; v_id uuid; v_from time; v_to time; v_before jsonb;
begin
  select st.event_id into v_event from stage st where st.id = v_stage;
  if v_event is null then raise exception 'stage_not_found' using errcode = 'P0002'; end if;
  if not exists (select 1 from event_day ed where ed.id = v_day and ed.event_id = v_event) then
    raise exception 'day_not_found' using errcode = 'P0002';
  end if;
  if not is_programme_editor(v_event) then raise exception 'not allowed' using errcode = '42501'; end if;

  v_from := nullif(p_data->>'open_from', '')::time;
  v_to   := nullif(p_data->>'open_to', '')::time;
  -- Eine Bühne, die schliesst, bevor sie öffnet, ist ein Tippfehler. Das Board
  -- würde daran jeden Slot ablehnen, ohne zu sagen, warum.
  if v_from is not null and v_to is not null and v_to <= v_from then
    raise exception 'invalid_times' using errcode = '22023';
  end if;

  select to_jsonb(sd) into v_before from stage_day sd
   where sd.stage_id = v_stage and sd.event_day_id = v_day;

  insert into stage_day (stage_id, event_day_id, open_from, open_to, slot_quota, notes)
  values (v_stage, v_day, v_from, v_to, (p_data->>'slot_quota')::integer, nullif(btrim(p_data->>'notes'), ''))
  on conflict (stage_id, event_day_id) do update set
    open_from  = case when p_data ? 'open_from' then excluded.open_from else stage_day.open_from end,
    open_to    = case when p_data ? 'open_to' then excluded.open_to else stage_day.open_to end,
    slot_quota = case when p_data ? 'slot_quota' then excluded.slot_quota else stage_day.slot_quota end,
    notes      = case when p_data ? 'notes' then excluded.notes else stage_day.notes end
  returning id into v_id;

  perform log_audit('programme.stage_day_upsert', 'stage_day', v_id::text, v_before, p_data);
  return v_id;
end $$;

-- ---------------------------------------------------------------- Tracks

create or replace function upsert_track(p_data jsonb) returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_id uuid := nullif(p_data->>'id', '')::uuid; v_event uuid; v_before jsonb;
begin
  if v_id is not null then
    select t.event_id, to_jsonb(t) into v_event, v_before from track t where t.id = v_id;
    if v_event is null then raise exception 'track_not_found' using errcode = 'P0002'; end if;
  else
    v_event := nullif(p_data->>'event_id', '')::uuid;
    if not exists (select 1 from event e where e.id = v_event) then
      raise exception 'event_not_found' using errcode = 'P0002';
    end if;
  end if;
  if not is_programme_editor(v_event) then raise exception 'not allowed' using errcode = '42501'; end if;

  if v_id is null then
    insert into track (event_id, name_de, name_en, slug, sort_order)
    values (v_event, btrim(p_data->>'name_de'), nullif(btrim(p_data->>'name_en'), ''),
            nullif(btrim(p_data->>'slug'), ''), coalesce((p_data->>'sort_order')::integer, 0))
    returning id into v_id;
  else
    update track set
      name_de    = coalesce(nullif(btrim(p_data->>'name_de'), ''), name_de),
      name_en    = case when p_data ? 'name_en' then nullif(btrim(p_data->>'name_en'), '') else name_en end,
      slug       = case when p_data ? 'slug' then nullif(btrim(p_data->>'slug'), '') else slug end,
      sort_order = coalesce((p_data->>'sort_order')::integer, sort_order)
    where id = v_id;
  end if;

  perform log_audit('programme.track_upsert', 'track', v_id::text, v_before, p_data);
  return v_id;
end $$;

/** Track löschen — nur solange keine Session darauf zeigt. */
create or replace function delete_track(p_id uuid) returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_event uuid; v_n integer; v_before jsonb;
begin
  select t.event_id, to_jsonb(t) into v_event, v_before from track t where t.id = p_id;
  if v_event is null then raise exception 'track_not_found' using errcode = 'P0002'; end if;
  if not is_programme_editor(v_event) then raise exception 'not allowed' using errcode = '42501'; end if;
  select count(*)::integer into v_n from session se where se.track_id = p_id;
  if v_n > 0 then raise exception 'in_use' using errcode = 'P0001', detail = 'sessions:' || v_n; end if;
  delete from track where id = p_id;
  perform log_audit('programme.track_delete', 'track', p_id::text, v_before, null);
end $$;

-- ---------------------------------------------------------------- Lesen

/**
 * Das Gerüst einer Edition in einem Zug — **mit den Zahlen, die am Löschen
 * hängen.**
 *
 * `slots` je Tag und je Bühne steht nicht aus Neugier da: die Oberfläche soll
 * „Diese Bühne trägt 30 Slots" sagen können, bevor jemand auf Löschen drückt,
 * statt ihn in `stage_in_use` laufen zu lassen. Ein Fehler, den man vorher
 * sehen kann, ist kein Fehler mehr.
 */
create or replace function programme_skeleton(p_event_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_ev uuid;
begin
  select coalesce(p_event_id, (select e.id from event e where e.is_edition order by e.start_date desc limit 1))
    into v_ev;
  if v_ev is null then raise exception 'event_not_found' using errcode = 'P0002'; end if;
  if not is_programme_editor(v_ev) then raise exception 'not allowed' using errcode = '42501'; end if;

  return jsonb_build_object(
    'event', (select jsonb_build_object('id', e.id, 'name', e.name, 'slug', e.slug,
                                        'start_date', e.start_date, 'end_date', e.end_date,
                                        'timezone', e.timezone, 'venue', e.venue)
                from event e where e.id = v_ev),
    'days', coalesce((select jsonb_agg(jsonb_build_object(
                        'id', ed.id, 'day_date', ed.day_date, 'label_de', ed.label_de, 'label_en', ed.label_en,
                        'doors_open', ed.doors_open, 'programme_start', ed.programme_start,
                        'programme_end', ed.programme_end, 'sort_order', ed.sort_order,
                        'slots', (select count(*) from slot s where s.event_day_id = ed.id))
                      order by ed.day_date, ed.sort_order)
                from event_day ed where ed.event_id = v_ev), '[]'::jsonb),
    'stages', coalesce((select jsonb_agg(jsonb_build_object(
                        'id', st.id, 'name', st.name, 'slug', st.slug, 'type', st.type, 'room', st.room,
                        'capacity', st.capacity, 'changeover_min', st.changeover_min,
                        'default_duration_min', st.default_duration_min,
                        'partner_slot_quota', st.partner_slot_quota, 'partner_org_id', st.partner_org_id,
                        'partner_org_name', (select coalesce(o.communication_name, o.legal_name)
                                               from organization o where o.id = st.partner_org_id),
                        'stage_lead_person_id', st.stage_lead_person_id,
                        'stage_lead_name', (select nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
                                              from person p where p.id = st.stage_lead_person_id),
                        'sort_order', st.sort_order, 'active', st.active,
                        'slots', (select count(*) from slot s where s.stage_id = st.id))
                      order by st.sort_order, st.name)
                from stage st where st.event_id = v_ev), '[]'::jsonb),
    'stage_days', coalesce((select jsonb_agg(jsonb_build_object(
                        'id', sd.id, 'stage_id', sd.stage_id, 'event_day_id', sd.event_day_id,
                        'open_from', sd.open_from, 'open_to', sd.open_to,
                        'slot_quota', sd.slot_quota, 'notes', sd.notes))
                from stage_day sd
                join stage st on st.id = sd.stage_id
                where st.event_id = v_ev), '[]'::jsonb),
    'tracks', coalesce((select jsonb_agg(jsonb_build_object(
                        'id', t.id, 'name_de', t.name_de, 'name_en', t.name_en, 'slug', t.slug,
                        'sort_order', t.sort_order,
                        'sessions', (select count(*) from session se where se.track_id = t.id))
                      order by t.sort_order, t.name_de)
                from track t where t.event_id = v_ev), '[]'::jsonb)
  );
end $$;

select harden_definer_functions();

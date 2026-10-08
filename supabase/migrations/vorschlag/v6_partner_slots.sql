-- 02NN · Partner-Slots: Partner legen auf Standbühne und gebrandeter Bühne selbst Slots an (K-84, LEAD-064)
-- Nummer und Zeitstempel vergibt die Architektur-Session beim Anwenden.
--
-- Anlass: K-84 (Konrad 08.10., Q2 ja): Auf Partner-Bühnen (`stage.kind` `booth` und `branded` mit eigener Organisation) legt der Partner im
-- Rahmen seiner Zeiten selbst Slots an, verschiebt und löscht sie; die Länge darf von der normalen abweichen. Vorschlag vorab:
-- `docs/vorschlag-partner-slots-k84.md` (#400), Plans Antworten R1–R5 vom 08.10.: (R1) neuer Helfer `can_edit_stage_slots`, `can_edit_stage`
-- bleibt unverändert — der Partner bekommt keine Regie; (R2) alle Inhalts-Slots der eigenen Partnerbühne löschbar, auch vom Team angelegte,
-- veröffentlichte zuerst zurückziehen (`unpublish_first`), gesperrte nicht (`slot_locked`); (R3) Kontingente bleiben Anzeige; (R4) die
-- Mitternachtskorrektur gilt auch für Stage Leads (`outside_stage_day`); (R5) `outside_partner_window` auch für die gebrandete Bühne;
-- F2: Partner legen nur `content` an.
--
-- Was die Migration tut (nur Funktionen — keine Tabelle, keine Spalte)
--   1  `slot_outside_window(Beginn, Ende, Tag, von, bis, Zone)`: liegt ein Slot außerhalb von Tag + Fenster? Rechnet in **Zeitpunkten** der
--      Event-Zeit, nicht in Uhrzeiten: ein Slot von 18:30 bis 01:00 am Folgetag besteht die Prüfung nicht mehr (Befund F1); `24:00` heißt
--      „nächster Tag 00:00“, eine fehlende Grenze heißt keine Grenze. Intern.
--   2  `can_edit_stage_slots(Bühne)` = `can_edit_stage` **oder** Rolle `standbuehne_editor` im Scope `org` einer gebrandeten Bühne dieser
--      Organisation. Intern. `can_edit_stage` bleibt, wie es ist (an ihm hängt die Regie: `can_edit_regie`).
--   3  `partner_window_binds` und `partner_booth_window` bedienen `kind in ('booth', 'branded')` mit Partner statt nur `type = 'partner_booth'`:
--      das Fenster der Standbühne (PART-090) gilt auch auf der gebrandeten Bühne — je Grenze die Öffnungszeit der Bühne an dem Tag, sonst der
--      Tagesrahmen der Veranstaltung, ganz ohne Rahmen keine Grenze. Team (`admin`, `programme_team`) bindet es nicht. Interview Table, Raum und
--      Side-Event-Ort bleiben ungebunden.
--   4  `create_slot`: Recht über `can_edit_stage_slots`; wer als Partner gebunden ist (`partner_window_binds`), legt nur `content` an
--      (P0001 `slot_type_not_allowed`, Befund F2); beide Fenster (Stage Lead `outside_stage_day`, Partner `outside_partner_window`) rechnen in
--      Zeitpunkten.
--   5  `move_slot`: Recht der Zielbühne über `can_edit_stage_slots`; dieselben Fenster in Zeitpunkten; die Warnungen `before_open` und
--      `after_close` ebenso.
--   6  Neu `delete_slot(Slot)`: Programm-Team (jede Art) oder, auf einer Partnerbühne, wer `can_edit_slot` hat und der Slot ist `content`.
--      Abweisung bei veröffentlichter Session (`unpublish_first`) und bei zugesagten oder bestätigten Bewerbungen (`slot_locked`, Zahl im
--      detail). Eine unveröffentlichte Session am Slot bleibt und geht zurück ins Backlog (`session.slot_id` wird NULL, FK `on delete set
--      null`); `slot_history` (cascade) geht mit — der Audit-Eintrag `slot.delete` mit dem Zustand davor bleibt (Bühne, Tag, Zeit, Art, Status,
--      Session-ID; keine Adresse).
--
-- Bleibt unverändert: Sperrzeiten und Gültigkeitstage (`stage_slot_check`, hart für alle), die Überlappungssperre, die Rückfrage bei
-- veröffentlichten Sessions, die Warnungen (`off_grid_5min`, `changeover_short`, `speaker_conflict`), `can_edit_slot`, `can_edit_session`,
-- `attach_session_to_slot`, die Gäste-Regel, die Änderungsmail LEAD-063 und die Slotlänge (die Datenbank kennt keine Bindung an
-- `default_duration_min` oder `changeover_min`).
--
-- Basis: Snapshot nach 0280 (`create_slot`, `move_slot`, `partner_window_binds`, `partner_booth_window`).
set search_path = public, extensions;

-- === 1 · Fenster in Zeitpunkten ================================================================================================
create or replace function slot_outside_window(
  p_start timestamptz, p_end timestamptz, p_day date, p_von time, p_bis time, p_tz text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $$
  select coalesce(
    (p_von is not null and p_start < ((p_day + p_von) at time zone p_tz))
    or (p_bis is not null and p_end > ((p_day + p_bis) at time zone p_tz)),
    false)
$$;
comment on function slot_outside_window(timestamptz, timestamptz, date, time, time, text) is
  'K-84/LEAD-064: liegt ein Slot außerhalb von Tag + Fenster? Rechnet in Zeitpunkten der Event-Zeit (ein Slot über Mitternacht besteht nicht); 24:00 = nächster Tag 00:00; fehlende Grenze = keine Grenze.';

-- === 2 · Recht auf Slots einer Bühne ===========================================================================================
create or replace function can_edit_stage_slots(p_stage_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select can_edit_stage(p_stage_id)
      or exists (
        select 1
          from stage st
          join active_roles() ra on true
         where st.id = p_stage_id
           and ra.role = 'standbuehne_editor' and ra.scope_type = 'org'
           and st.kind = 'branded' and st.partner_org_id is not null and ra.scope_id = st.partner_org_id)
$$;
comment on function can_edit_stage_slots(uuid) is
  'K-84/LEAD-064: darf die Person Slots auf dieser Bühne anlegen, verschieben (Ziel) und löschen? can_edit_stage oder der Standbühnen-Editor der Organisation einer gebrandeten Bühne. can_edit_stage bleibt unverändert — an ihm hängt die Regie.';

-- === 3 · Das Partner-Fenster gilt auch auf der gebrandeten Bühne =============================================================
create or replace function partner_window_binds(p_stage_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select exists (select 1 from stage st
                  where st.id = p_stage_id and st.kind in ('booth', 'branded') and st.partner_org_id is not null)
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

create or replace function partner_booth_window(p_stage_id uuid, p_event_day_id uuid)
 RETURNS TABLE(von time without time zone, bis time without time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select coalesce(sd.open_from, ed.programme_start),
         coalesce(sd.open_to, ed.programme_end, time '24:00')
    from stage st
    left join stage_day sd on sd.stage_id = st.id and sd.event_day_id = p_event_day_id
    left join event_day ed on ed.id = p_event_day_id and ed.event_id = st.event_id
   where st.id = p_stage_id and st.kind in ('booth', 'branded')
$$;

-- === 4 · create_slot ============================================================================================================
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
  -- K-84: Standbühne und gebrandete Bühne der eigenen Organisation zählen mit (Helfer statt can_edit_stage — die Regie bleibt zu).
  if not can_edit_stage_slots(p_stage_id) then
    raise exception 'not allowed on this stage' using errcode = '42501';
  end if;
  if p_end <= p_start then
    raise exception 'end must be after start' using errcode = '22023';
  end if;
  -- K-84 (F2): wer auf einer Partnerbühne als Partner arbeitet, legt nur Inhalts-Slots an. Rahmen, feste Blöcke, Platzhalter und
  -- Partner-Blöcke setzt das Team.
  if p_slot_type is distinct from 'content' and partner_window_binds(p_stage_id) then
    raise exception 'slot_type_not_allowed' using errcode = 'P0001', detail = coalesce(p_slot_type, 'null');
  end if;
  select * into v_stage from stage where id = p_stage_id;
  select timezone into v_tz from event where id = v_stage.event_id;
  select * into v_day from event_day
    where event_id = v_stage.event_id and day_date = (p_start at time zone v_tz)::date;
  if not found then
    raise exception 'no event day for % on this stage', p_start using errcode = '22023';
  end if;

  -- ADM-085: Gültigkeitstage der Bühne und Sperrzeiten (nur Inhalts-Slots) — hart für alle, der Grund steht im detail.
  perform stage_slot_check(p_stage_id, p_start, p_end, p_slot_type);

  -- Tagesrahmen (LEAD-016): für Stage Leads hart, für das Programm-Team eine
  -- Warnung wie bisher. Ohne Rahmen keine Grenze (siehe Kopf). K-84 (R4): in Zeitpunkten gerechnet — ein Slot über Mitternacht besteht nicht.
  select * into v_sd from stage_day where stage_id = p_stage_id and event_day_id = v_day.id;
  if found and stage_frame_binds(p_stage_id)
     and slot_outside_window(p_start, p_end, v_day.day_date, v_sd.open_from, v_sd.open_to, v_tz) then
    raise exception 'outside_stage_day' using errcode = 'P0001',
      detail = coalesce(to_char(v_sd.open_from, 'HH24:MI'), '') || '–' || coalesce(to_char(v_sd.open_to, 'HH24:MI'), '');
  end if;
  -- PART-079/090, K-84: Partnerbühne (Standbühne und gebrandete Bühne) — Fenster = Öffnungszeiten der Bühne, sonst der Tagesrahmen. Für den
  -- Partner hart; das Programm-Team darf abweichen. In Zeitpunkten gerechnet (R5: derselbe Schlüssel für beide Arten).
  if partner_window_binds(p_stage_id) then
    select * into v_win from partner_booth_window(p_stage_id, v_day.id);
    if slot_outside_window(p_start, p_end, v_day.day_date, v_win.von, v_win.bis, v_tz) then
      raise exception 'outside_partner_window' using errcode = 'P0001',
        detail = coalesce(to_char(v_win.von, 'HH24:MI'), '') || '–' || coalesce(to_char(v_win.bis, 'HH24:MI'), '');
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

-- === 5 · move_slot ==============================================================================================================
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
  -- K-84: Zielbühne über den Helfer (eigene Standbühne und eigene gebrandete Bühne zählen mit).
  if p_stage_id <> v_slot.stage_id and not can_edit_stage_slots(p_stage_id) then
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
  -- ADM-085: Gültigkeitstage der Zielbühne und Sperrzeiten — **vor** der Rückfrage zur Veröffentlichung, damit niemand erst
  -- bestätigt und dann abgewiesen wird. Sperrzeiten gelten für Inhalts-Slots; Rahmen und feste Blöcke bleiben frei.
  perform stage_slot_check(p_stage_id, p_start, p_end, v_slot.slot_type);
  select exists (select 1 from session se where se.slot_id = p_slot_id and se.publish_status = 'published')
    into v_published;
  if v_published and not p_confirm then
    raise exception 'confirmation_required'
      using errcode = 'P0001', hint = 'Slot ist veröffentlicht. Verschieben nur mit Bestätigung.';
  end if;
  select * into v_sd from stage_day where stage_id = p_stage_id and event_day_id = v_day.id;
  -- Tagesrahmen (LEAD-016): für Stage Leads hart, für das Programm-Team eine
  -- Warnung wie bisher. Ohne Rahmen keine Grenze (siehe Kopf). K-84 (R4): in Zeitpunkten gerechnet.
  if found and stage_frame_binds(p_stage_id)
     and slot_outside_window(p_start, p_end, v_day.day_date, v_sd.open_from, v_sd.open_to, v_tz) then
    raise exception 'outside_stage_day' using errcode = 'P0001',
      detail = coalesce(to_char(v_sd.open_from, 'HH24:MI'), '') || '–' || coalesce(to_char(v_sd.open_to, 'HH24:MI'), '');
  end if;
  if found then
    if slot_outside_window(p_start, p_end, v_day.day_date, v_sd.open_from, null, v_tz) then
      v_warn := array_append(v_warn, 'before_open');
    end if;
    if slot_outside_window(p_start, p_end, v_day.day_date, null, v_sd.open_to, v_tz) then
      v_warn := array_append(v_warn, 'after_close');
    end if;
  end if;
  -- PART-079/090, K-84: Partnerbühne (Standbühne und gebrandete Bühne) — Fenster = Öffnungszeiten der Bühne, sonst der Tagesrahmen. Für den
  -- Partner hart; das Programm-Team darf abweichen. In Zeitpunkten gerechnet.
  if partner_window_binds(p_stage_id) then
    select * into v_win from partner_booth_window(p_stage_id, v_day.id);
    if slot_outside_window(p_start, p_end, v_day.day_date, v_win.von, v_win.bis, v_tz) then
      raise exception 'outside_partner_window' using errcode = 'P0001',
        detail = coalesce(to_char(v_win.von, 'HH24:MI'), '') || '–' || coalesce(to_char(v_win.bis, 'HH24:MI'), '');
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

-- === 6 · delete_slot ============================================================================================================
create or replace function delete_slot(p_slot_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_slot   slot%rowtype;
  v_ev     uuid;
  v_se     session%rowtype;
  v_n      integer;
  v_before jsonb;
begin
  if current_person_id() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select * into v_slot from slot where id = p_slot_id for update;
  if not found then
    raise exception 'slot not found' using errcode = 'P0002';
  end if;
  select st.event_id into v_ev from stage st where st.id = v_slot.stage_id;
  -- Das Programm-Team löscht jede Art; auf einer Partnerbühne löscht, wer den Slot bearbeiten darf — nur Inhalts-Slots (R2: auch die vom
  -- Team angelegten). NULL-sicher: ohne ausdrückliches Ja kein Recht.
  if not coalesce(is_programme_editor(v_ev)
                  or (partner_window_binds(v_slot.stage_id) and can_edit_slot(p_slot_id) and v_slot.slot_type = 'content'), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_se from session where slot_id = p_slot_id;
  if found then
    if v_se.publish_status = 'published' then
      raise exception 'unpublish_first' using errcode = 'P0001';
    end if;
    -- Wer zugesagt hat, hat sich den Termin eingetragen (wie in partner_delete_session).
    select count(*)::integer into v_n from application a
     where a.session_id = v_se.id and a.status in ('accepted', 'confirmed');
    if v_n > 0 then
      raise exception 'slot_locked' using errcode = 'P0001', detail = v_n::text;
    end if;
  end if;
  v_before := jsonb_build_object('stage_id', v_slot.stage_id, 'event_day_id', v_slot.event_day_id,
                                 'start_at', v_slot.start_at, 'end_at', v_slot.end_at,
                                 'slot_type', v_slot.slot_type, 'status', v_slot.status, 'session_id', v_se.id);
  -- Die Session am Slot bleibt und geht zurück ins Backlog (session.slot_id → NULL), der Verlauf (slot_history) geht mit dem Slot.
  delete from slot where id = p_slot_id;
  perform log_audit('slot.delete', 'slot', p_slot_id::text, v_before, null);
end $$;
comment on function delete_slot(uuid) is
  'K-84/LEAD-064: Slot löschen. Programm-Team jede Art, Partner auf der eigenen Partnerbühne nur Inhalts-Slots; veröffentlichte Session: unpublish_first, zugesagte Bewerbungen: slot_locked. Audit slot.delete mit dem Zustand davor; eine unveröffentlichte Session geht zurück ins Backlog.';

-- === 7 · Rechte =================================================================================================================
-- Interne Helfer: nur Definer-Aufrufer. `delete_slot` ist wie `create_slot` für `authenticated` ausführbar (anon nimmt harden_definer_functions).
revoke execute on function slot_outside_window(timestamptz, timestamptz, date, time, time, text) from public, anon, authenticated;
revoke execute on function can_edit_stage_slots(uuid) from public, anon, authenticated;

select harden_definer_functions();

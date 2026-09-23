-- 0146 · Welle 6 · Technik neu geschnitten: Ansage beim Speaker, Disposition
-- Angewendet von der Architektur-Session am 23.09.2026 als 20260923111840.
--
-- bei der Regie (SPK-029, LEAD-012)
--
-- **Nummer offen.** Vorschlag der Build-Session Speaker-Domäne; Anwenden,
-- Umbenennen und der Eintrag ins Entscheidungslog gehören der
-- Architektur-/Security-Session.
--
-- Anlass: Konrad am 21.09. — die Technik-Ansage fragt den Speaker Dinge, die
-- er nicht wissen kann. „Personen auf der Bühne ist eine Info, die von den
-- Stage Leads kommt. Bitte bei den Speakern rausnehmen." Dazu Mikrofon als
-- Einfachauswahl, Präsentation/Medien und Mobiliar zu den Stage Leads.
-- Am 22.09.: „Die Auswahl der Speaker sollte als Auswahl sein, für die Regie
-- brauchen wir ein zweites Feld als Freitext." Am 23.09.: „Stage Leads machen
-- auch Regie. Das muss im Admin Bereich und bei den Stage Leads liegen."
--
-- **Der Umbau ist kleiner als gedacht.** `regie_cue` trägt die Disposition
-- längst: `mobiliar`, `media`, `mic_assignments`, `backstage`, `notes`. Es
-- fehlte genau ein Feld — **„Personen auf der Bühne"**. Ein eigener Datensatz
-- für Regieanweisungen wäre eine dritte Stelle für dieselbe Sache gewesen.
--
-- Die Rollenverteilung bleibt damit, wie sie seit 0117 gilt: `session.tech`
-- ist die **Ansage des Speakers**, `regie_cue` die **Disposition der Regie**.
-- Neu ist nur, dass die Ansage auf das eingedampft wird, was ein Speaker
-- beantworten kann.
--
-- **Bestand geprüft (23.09.):** von 11 Sessions trägt **keine einzige** eine
-- Technik-Ansage. Das Entfernen der drei Schlüssel unten ist also Vorsicht,
-- kein Datentransport — aber es steht hier, damit der Zustand nach der
-- Migration eindeutig ist.

-- ------------------------------------------------- das eine fehlende Feld
alter table regie_cue add column if not exists people_on_stage text;

comment on column regie_cue.people_on_stage is
  'Wer auf der Bühne steht — Angabe der Stage Leads, nicht des Speakers (SPK-029).';

-- ------------------------------------------------------------ Mikrofonwahl
insert into vocab_term (vocabulary, key, label_de, label_en, sort_order) values
  ('speaker_microphone', 'headset',  'Headset',   'Headset',        1),
  ('speaker_microphone', 'handheld', 'Handmikro', 'Handheld mic',   2)
on conflict (vocabulary, key) do nothing;

-- ---------------------------------------------- was der Speaker noch angibt
create or replace function session_tech_keys()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions'
AS $$
  select array['microphone', 'special_requirements']::text[]
$$;

-- Altbestand: die drei Schlüssel, die jetzt der Regie gehören, fallen aus der
-- Ansage heraus. Ohne das stünden sie für immer in `session.tech` und die
-- Regie sähe sie doppelt — einmal als Ansage, einmal als eigene Disposition.
update session
   set tech = tech - 'people_on_stage' - 'presentation_media' - 'furniture'
 where tech ?| array['people_on_stage', 'presentation_media', 'furniture'];

-- Aus dem Snapshot übernommen. Zwei Änderungen: das Mikrofon ist jetzt eine
-- Auswahl, und die Vorbelegung aus dem Rider setzt es **nicht** mehr — dort
-- steht Freitext („Headset, bitte Ersatz bereithalten"), der als Schlüssel
-- nicht gültig wäre und das Speichern reihenweise scheitern liesse.
create or replace function update_session_tech(p_session_id uuid, p_tech jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_me uuid := current_person_id(); v_key text; v_val text;
  v_neu jsonb := '{}'::jsonb; v_alt jsonb; v_rider jsonb; v_person uuid;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from session s where s.id = p_session_id) then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  -- Speaker der Session, oder die Assistenz eines solchen Speakers.
  select ss.person_id into v_person
    from session_speaker ss
    join speaker_profile sp on sp.person_id = ss.person_id
   where ss.session_id = p_session_id
     and (ss.person_id = v_me or sp.assistant_person_id = v_me)
   limit 1;
  if v_person is null then raise exception 'not allowed' using errcode = '42501'; end if;

  if p_tech is null or jsonb_typeof(p_tech) <> 'object' then
    raise exception 'invalid_tech_key' using errcode = '22023', detail = 'object_required';
  end if;

  for v_key, v_val in select key, value #>> '{}' from jsonb_each(p_tech) loop
    if not (v_key = any (session_tech_keys())) then
      raise exception 'invalid_tech_key' using errcode = '22023', detail = v_key;
    end if;
    v_val := nullif(btrim(coalesce(v_val, '')), '');
    if v_val is not null and length(v_val) > 500 then
      raise exception 'tech_too_long' using errcode = '22023', detail = v_key;
    end if;
    -- Das Mikrofon ist seit dem 22.09. eine Auswahl, kein Freitext mehr.
    if v_key = 'microphone' and v_val is not null
       and not is_vocab_key('speaker_microphone', v_val) then
      raise exception 'invalid_microphone' using errcode = '22023', detail = v_val;
    end if;
    -- Leere Felder fallen heraus, statt als "" zu bleiben: sonst steht später
    -- in der Regie eine leere Zeile, die wie eine Angabe aussieht.
    if v_val is not null then
      v_neu := v_neu || jsonb_build_object(v_key, v_val);
    end if;
  end loop;

  select s.tech into v_alt from session s where s.id = p_session_id;

  -- Vorbelegung aus dem Rider, aber nur beim **ersten** Mal und nur für
  -- Schlüssel, die die Eingabe nicht selbst setzt. Das Mikrofon ist hier
  -- bewusst raus (siehe Kopf).
  if coalesce(v_alt, '{}'::jsonb) = '{}'::jsonb then
    select sp.tech_rider into v_rider from speaker_profile sp where sp.person_id = v_person limit 1;
    if v_rider is not null and jsonb_typeof(v_rider) = 'object' then
      if not (v_neu ? 'special_requirements')
         and nullif(btrim(coalesce(v_rider->>'notes', '')), '') is not null then
        v_neu := v_neu || jsonb_build_object('special_requirements', btrim(v_rider->>'notes'));
      end if;
    end if;
  end if;

  update session set tech = v_neu, updated_at = now(), updated_by = v_me where id = p_session_id;

  -- Nur die **Schlüssel** ins Protokoll, nicht die Werte: was ein Speaker an
  -- besonderen Anforderungen schreibt, kann persönlich sein (dieselbe Regel wie
  -- bei der Ernährung, 0100).
  perform log_audit('speaker.session_tech', 'session', p_session_id::text,
    jsonb_build_object('keys', (select coalesce(array_agg(k), array[]::text[])
                                  from jsonb_object_keys(coalesce(v_alt, '{}'::jsonb)) k)),
    jsonb_build_object('keys', (select coalesce(array_agg(k), array[]::text[])
                                  from jsonb_object_keys(v_neu) k)));

  return v_neu;
end $$;

-- ------------------------------------------------ die Regie schreibt es mit
-- Aus dem Snapshot; neu ist allein `people_on_stage` an beiden Stellen.
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

-- ----------------------------------------------- und die Regie sieht es auch
-- Der Rückgabetyp bekommt eine Spalte, deshalb drop/create. Die Rechte danach
-- ausdrücklich setzen — ein `drop` nimmt die Grants mit.
drop function if exists regie_view(uuid, uuid);

create function regie_view(p_stage_id uuid, p_event_day_id uuid)
 RETURNS TABLE(cue_id uuid, cue_start timestamp with time zone, cue_end timestamp with time zone, sort_order integer, action text, umbau_min integer, moderation text, regie text, backstage text, mobiliar text, notes text, people_on_stage text, mic_assignments jsonb, media jsonb, slot_id uuid, slot_status text, session_id uuid, title text, format text, speakers jsonb, tech jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not can_edit_regie(p_stage_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select c.id, c.cue_start, c.cue_end, c.sort_order,
           c.action, c.umbau_min, c.moderation, c.regie, c.backstage,
           c.mobiliar, c.notes, c.people_on_stage, c.mic_assignments, c.media,
           c.slot_id, sl.status, se.id,
           coalesce(se.title_de, se.title_en), se.format,
           case when se.id is null then '[]'::jsonb else session_speakers_public(se.id) end,
           -- Cues ohne Session (Doors open, Puffer, Soundcheck) haben keine
           -- Ansage; `coalesce` hält die Spalte leer statt null, damit die
           -- Oberfläche nicht je Zeile unterscheiden muss.
           coalesce(se.tech, '{}'::jsonb)
      from regie_cue c
      left join slot sl on sl.id = c.slot_id
      left join session se on se.slot_id = sl.id
     where c.stage_id = p_stage_id and c.event_day_id = p_event_day_id
     order by c.cue_start, c.sort_order;
end $$;

revoke all on function regie_view(uuid, uuid) from public, anon;
grant execute on function regie_view(uuid, uuid) to authenticated;

select harden_definer_functions();

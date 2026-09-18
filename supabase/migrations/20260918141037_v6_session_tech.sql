-- 00NN · Welle 6 · Technik am Slot: die Ansage des Speakers (A7.2, SPK-018, PROD-007)
--
-- Vorschlag der Build-Session Speaker-Domäne. Anwenden, Umbenennen und der
-- Eintrag ins Entscheidungslog gehören der Architektur-/Security-Session.
--
-- Anlass: Konrad am 17.09. — Technik liegt heute getrennt vom Slot, teils als
-- `speaker_profile.tech_rider` (vier Felder am Menschen statt am Auftritt),
-- teils gar nicht. Sie gehört unter „Slot", mit den Feldern der Regie 2026:
-- Personen auf der Bühne, Mikrofon, Präsentation, besondere Anforderungen,
-- Mobiliar.
--
-- **Freitext, keine Auswahlwerte** (Konrad, 17.09.: „ich denke Freitext bietet
-- mehr Flexibilität"). Der Entwurf sah `microphone` als headset|hand|both und
-- `presentation_media` als Liste vor; beides ist zurückgenommen. Die
-- **Schlüssel** bleiben fest — sonst entsteht wieder ein Sammelfeld, aus dem
-- sich keine Liste bauen lässt —, die **Werte** sind Text.
--
-- **Rollenverteilung** (Architektur-Session, 17.09.): `session.tech` ist die
-- **Ansage des Speakers**. `regie_cue.mic_assignments` und `regie_cue.media`
-- bleiben die **Disposition der Regie**. Die Regie zeigt die Ansage daneben und
-- überschreibt sie nicht. Ohne diese Trennung gäbe es zwei Felder für dieselbe
-- Aussage und keines wäre die Wahrheit.
--
-- `speaker_profile.tech_rider` bleibt bestehen und dient als **Vorbelegung**
-- beim ersten Schreiben; danach gilt, was am Slot steht.
--
-- Die Anzeige in der Regie ist **nicht** Teil dieser Migration: ob `regie_view`
-- eine Spalte bekommt (drop + create) oder eine eigene Lese-RPC entsteht, ist
-- eine Frage an die Architektur-Session, weil `regie_view` auch die Produktion
-- rendert.
--
-- Fehlerschlüssel: 28000 · 42501 · P0002 `session_not_found` ·
-- 22023 `invalid_tech_key` (+ detail = der unbekannte Schlüssel),
-- `tech_too_long` (+ detail = Feld).

set search_path = public, extensions;

alter table session add column if not exists tech jsonb not null default '{}'::jsonb;

comment on column session.tech is
  'Technik-Ansage des Speakers je Slot (A7.2): people_on_stage, microphone, presentation_media, special_requirements, furniture — feste Schlüssel, Werte als Freitext. Die Disposition der Regie steht in regie_cue.';

/**
 * Die erlaubten Schlüssel an einer Stelle.
 *
 * Als Funktion statt als CHECK, weil die Schreibfunktion einen sprechenden
 * Fehler mit dem unbekannten Schlüssel im `detail` liefern soll — ein
 * verletzter CHECK sagt nur, dass etwas nicht passt, nicht was.
 */
create or replace function session_tech_keys() returns text[]
language sql immutable as $$
  select array['people_on_stage', 'microphone', 'presentation_media',
               'special_requirements', 'furniture']::text[]
$$;
revoke execute on function session_tech_keys() from public, anon, authenticated;

/**
 * Technik zu einer eigenen Session schreiben.
 *
 * Nur wer auf der Bühne steht, sagt an, was er braucht: Speaker und Assistenz
 * über `session_speaker`. Das Team pflegt die Regie, nicht die Ansage — sonst
 * stünde am Ende die Meinung des Teams dort, wo der Speaker gelesen wird.
 *
 * Unbekannte Schlüssel werden **abgewiesen**, nicht stillschweigend verworfen:
 * ein Tippfehler im Formular soll auffallen, solange jemand davorsitzt.
 *
 * Geschrieben wird der **ganze** Satz, nicht einzelne Felder: das Formular
 * zeigt alle fünf Angaben zugleich, also ist das, was ankommt, der neue Stand.
 * Ein Teil-Update sähe auf dem Papier schonender aus, hiesse aber, dass ein
 * geleertes Feld nicht geleert werden kann.
 */
create or replace function update_session_tech(p_session_id uuid, p_tech jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
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
    -- Leere Felder fallen heraus, statt als "" zu bleiben: sonst steht später
    -- in der Regie eine leere Zeile, die wie eine Angabe aussieht.
    if v_val is not null then
      v_neu := v_neu || jsonb_build_object(v_key, v_val);
    end if;
  end loop;

  select s.tech into v_alt from session s where s.id = p_session_id;

  -- Vorbelegung aus dem Rider, aber nur beim **ersten** Mal und nur für
  -- Schlüssel, die die Eingabe nicht selbst setzt.
  if coalesce(v_alt, '{}'::jsonb) = '{}'::jsonb then
    select sp.tech_rider into v_rider from speaker_profile sp where sp.person_id = v_person limit 1;
    if v_rider is not null and jsonb_typeof(v_rider) = 'object' then
      if not (v_neu ? 'microphone') and nullif(btrim(coalesce(v_rider->>'mic', '')), '') is not null then
        v_neu := v_neu || jsonb_build_object('microphone', btrim(v_rider->>'mic'));
      end if;
      if not (v_neu ? 'special_requirements')
         and nullif(btrim(coalesce(v_rider->>'notes', '')), '') is not null then
        v_neu := v_neu || jsonb_build_object('special_requirements', btrim(v_rider->>'notes'));
      end if;
    end if;
  end if;

  update session set tech = v_neu, updated_at = now(), updated_by = v_me where id = p_session_id;

  -- Nur die **Schlüssel** ins Protokoll, nicht die Werte: was ein Speaker an
  -- besonderen Anforderungen schreibt, kann persönlich sein (dieselbe Regel wie
  -- bei der Ernährung, 0100 — das Protokoll hält fest, *dass* jemand etwas
  -- gespeichert hat, nicht *was*).
  perform log_audit('speaker.session_tech', 'session', p_session_id::text,
    jsonb_build_object('keys', (select coalesce(array_agg(k), array[]::text[])
                                  from jsonb_object_keys(coalesce(v_alt, '{}'::jsonb)) k)),
    jsonb_build_object('keys', (select coalesce(array_agg(k), array[]::text[])
                                  from jsonb_object_keys(v_neu) k)));

  return v_neu;
end $$;

comment on function update_session_tech(uuid, jsonb) is
  'Technik-Ansage zu einer eigenen Session (Speaker oder Assistenz). Feste Schlüssel, Freitext-Werte, 500 Zeichen je Feld; beim ersten Schreiben Vorbelegung aus speaker_profile.tech_rider.';

-- === Lesen: die Ansage gehört in die Sessionliste ============================
--
-- Rückgabetyp ändert sich ⇒ drop + create (Konvention §1). Die bisherige
-- Spaltenliste bleibt **unverändert** und in derselben Reihenfolge; `tech`
-- kommt hinten an. Der Test hält die alte Liste gegen die neue und prüft
-- zusätzlich eine Spalte, die **nicht** Gegenstand der Änderung ist —
-- 0099 hat auf diesem Weg `internal_notes` aus `manager_speakers` verloren.

drop function if exists my_sessions();

create function my_sessions()
returns table (
  session_id uuid, event_id uuid, event_name text, title_de text, title_en text, description_de text, description_en text,
  language text, format text, access_mode text, publish_status text, speaker_role text, confirmed boolean,
  start_at timestamptz, end_at timestamptz, stage_name text, room text, timezone text,
  co_speakers jsonb, latest_submission jsonb, on_behalf_of jsonb, tech jsonb
)
language sql stable security definer set search_path = public, extensions as $$
  select se.id, se.event_id, e.name, se.title_de, se.title_en, se.description_de, se.description_en,
         se.language, se.format, se.access_mode, se.publish_status, ss.role, ss.confirmed,
         sl.start_at, sl.end_at, st.name, st.room, e.timezone,
         coalesce((select jsonb_agg(jsonb_build_object('person_id', p2.id, 'first_name', p2.first_name, 'last_name', p2.last_name, 'role', ss2.role) order by ss2.sort_order)
                   from session_speaker ss2 join person p2 on p2.id = ss2.person_id
                   where ss2.session_id = se.id and ss2.person_id <> ss.person_id), '[]'::jsonb),
         (select to_jsonb(sub) from (
            select s.id, s.title, s.description, s.topics, s.language, s.notes, s.status, s.review_note, s.created_at, s.reviewed_at
            from session_submission s where s.session_id = se.id order by s.created_at desc limit 1) sub),
         case when sp.person_id <> current_person_id()
              then jsonb_build_object('person_id', sp.person_id, 'first_name', p.first_name, 'last_name', p.last_name) end,
         coalesce(se.tech, '{}'::jsonb)
  from speaker_profile sp
  join person p on p.id = sp.person_id
  join session_speaker ss on ss.person_id = sp.person_id
  join session se on se.id = ss.session_id
  join event e on e.id = se.event_id and (e.edition_id = sp.edition_id or e.id = sp.edition_id)
  left join slot sl on sl.id = se.slot_id
  left join stage st on st.id = sl.stage_id
  where sp.person_id = current_person_id() or sp.assistant_person_id = current_person_id()
  order by sl.start_at nulls last, se.title_de
$$;

comment on function my_sessions() is
  'Die eigenen Sessions von Speaker und Assistenz, inklusive der Technik-Ansage (A7.2).';

select harden_definer_functions();

-- 0121 · Welle 6 · Die Technik-Ansage des Speakers im Regieplan (A7.2, SPK-018, PROD-007)
--
-- Vorschlag der Build-Session Speaker-Domäne. Anwenden, Umbenennen und der
-- Eintrag ins Entscheidungslog gehören der Architektur-/Security-Session.
-- Nummer 0121 zugeteilt (0120 hat der Admin-Chat).
--
-- Anlass: Seit 0117 trägt `session.tech` die **Ansage des Speakers** — was er
-- auf der Bühne braucht. Die Regie disponiert danach, konnte sie bisher aber
-- nicht sehen: `regie_view` liefert nur die eigenen Felder des Cues.
--
-- **Eine Spalte, kein zweiter Leseweg** (Entscheidung der Architektur-Session,
-- 18.09.): Die Regie rendert eine Tabelle; eine eigene RPC je Zeile wäre ein
-- zweiter Kontrakt für dieselbe Ansicht. `tech` kommt deshalb als weitere
-- Spalte hinten an `regie_view`.
--
-- **Anzeigen, nicht übernehmen.** `regie_cue.mic_assignments` und
-- `regie_cue.media` bleiben die Disposition der Regie und werden von dieser
-- Migration nicht angefasst. Die Ansage steht daneben. Würden wir sie
-- übernehmen, gäbe es zwei Felder für dieselbe Aussage und keines wäre die
-- Wahrheit.
--
-- **Rückgabetyp ändert sich ⇒ drop + create** (Konvention §1); `create or
-- replace` kann die Spaltenliste nicht ändern. Der Rumpf ist unverändert die
-- Live-Fassung aus 0101, ergänzt um `se.tech`. Danach die Grants ausdrücklich:
-- ein `drop` nimmt sie mit, und ohne `grant` wäre die Regie für alle zu.
--
-- Fehlerschlüssel: unverändert (42501).

set search_path = public, extensions;

drop function if exists regie_view(uuid, uuid);

create function regie_view(p_stage_id uuid, p_event_day_id uuid)
returns table(
  cue_id uuid, cue_start timestamptz, cue_end timestamptz, sort_order integer,
  action text, umbau_min integer, moderation text, regie text, backstage text,
  mobiliar text, notes text, mic_assignments jsonb, media jsonb,
  slot_id uuid, slot_status text, session_id uuid, title text, format text,
  speakers jsonb, tech jsonb)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not can_edit_regie(p_stage_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select c.id, c.cue_start, c.cue_end, c.sort_order,
           c.action, c.umbau_min, c.moderation, c.regie, c.backstage,
           c.mobiliar, c.notes, c.mic_assignments, c.media,
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

comment on function regie_view(uuid, uuid) is
  'Ablaufplan einer Bühne an einem Tag, inklusive der Technik-Ansage des Speakers aus session.tech (nur Anzeige; die Disposition der Regie steht in regie_cue).';

-- Der `drop` hat die Grants mitgenommen — ausdrücklich zurückgeben, sonst wäre
-- die Regie für alle zu. `anon` bekommt nichts (db-konventionen §5);
-- `harden_definer_functions()` am Ende zieht das ohnehin noch einmal nach.
revoke all on function regie_view(uuid, uuid) from public, anon;
grant execute on function regie_view(uuid, uuid) to authenticated;

select harden_definer_functions();

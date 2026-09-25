-- 0195 · Standbühnen-Fenster = Öffnungszeiten der Bühne, Rückfall Tagesrahmen (PART-090, ersetzt PART-079)
-- Angewendet von der Architektur-Session am 25.09.2026 als 20260925095914.
-- Standbühne: Zeitfenster = Öffnungszeiten der Bühne (PART-090, ersetzt PART-079)
--
-- **Ohne Nummer** (Regel vom 24.09.): die Architektur-Session vergibt sie beim Anwenden.
--
-- Anlass: Konrad, Klickrunde Partner 25.09. (PART-090): „Bei der Standbühne kann ich die Zeiten
-- wieder nicht anpassen. Partner sollen auf ihrer Bühne im Rahmen der Öffnungszeiten Slots beliebig
-- hinzufügen können.“ Entscheidung der Architektur-Session (Entscheidungslog 25.09., ersetzt
-- PART-079): das Fenster ist `stage_day.open_from` bis `open_to` der Standbühne — kein Aufschlag
-- von 90 Minuten, keine feste 19:00-Grenze; die Grenzen setzt das Team über die Öffnungszeiten der
-- Bühne im Admin (`/admin/edition`, Gerüst: Bühne × Tag); ohne `stage_day`-Zeile gilt der
-- Tagesrahmen der Veranstaltung.
--
-- Geändert wird nur `partner_booth_window` — Live-Fassung aus dem Snapshot, Signatur und Rückgabe
-- gleich. `create_slot` und `move_slot` rufen sie unverändert auf und prüfen weiter nur, wenn
-- `partner_window_binds` greift (Standbühne einer Organisation, nicht Admin oder Programm-Team).
--
-- * **Tagesrahmen der Veranstaltung** heißt `event_day.programme_start` bis `programme_end` —
--   derselbe Rahmen, den das Board als Zeitachse zeigt.
-- * **Je Grenze einzeln:** eine `stage_day`-Zeile, die nur ein Kontingent oder nur einen Beginn
--   trägt, fällt für die fehlende Grenze auf den Tag zurück, statt sie aufzuheben.
-- * **Das Ende ist nie NULL.** `create_slot` und `move_slot` bauen das detail als `von–bis`; ein
--   NULL-Ende machte aus der Meldung einen 22004 („RAISE statement option cannot be null“), sobald
--   der Beginn verletzt ist. Ohne jeden Rahmen steht deshalb 24:00 da — praktisch keine Grenze. Der
--   Beginn darf NULL sein, das fangen beide Aufrufer ab.
--
-- Die Kommentare „frühestens 90 Minuten … 19:00“ in `create_slot` und `move_slot` veralten damit.
-- Die beiden grossen Funktionen werden hier bewusst nicht noch einmal kopiert (LEAD-018 kann sie
-- parallel anfassen, zwei Vorschläge überschrieben sich still); der Kommentar zieht beim nächsten
-- Eingriff dort nach.

set search_path = public, extensions;

create or replace function partner_booth_window(p_stage_id uuid, p_event_day_id uuid)
 returns table (von time, bis time)
 language sql
 stable
 security definer
 set search_path = public, extensions
as $$
  select coalesce(sd.open_from, ed.programme_start),
         coalesce(sd.open_to, ed.programme_end, time '24:00')
    from stage st
    left join stage_day sd on sd.stage_id = st.id and sd.event_day_id = p_event_day_id
    left join event_day ed on ed.id = p_event_day_id and ed.event_id = st.event_id
   where st.id = p_stage_id and st.type = 'partner_booth'
$$;

comment on function partner_booth_window(uuid, uuid) is
  'Zeitfenster der Standbühne an einem Tag (PART-090): Öffnungszeiten aus stage_day, je fehlender Grenze der Tagesrahmen der Veranstaltung (event_day.programme_start/programme_end); Ende nie NULL (24:00 = keine Grenze). Intern, aufgerufen von create_slot und move_slot.';

-- Wie in 0179: intern, nur die SECURITY-DEFINER-Aufrufer brauchen sie.
revoke execute on function partner_booth_window(uuid, uuid) from public, anon, authenticated;

select harden_definer_functions();

-- 0166 · Welle 6 · Folien nach dem Summit für Teilnehmende (TAL-001): my_session_slides (Ticket der Edition, veröffentlicht, Slot vorbei, freigegeben)
-- Angewendet von der Architektur-Session am 24.09.2026 als 20260924141539.
-- 00NN · Folien nach dem Summit für Teilnehmende (TAL-001): Leserolle my_session_slides().
--
-- Anlass: TAL-001 (P1 seit 24.09.2026), Kontrakt des Speaker-Chats zu SPK-055 (0160
-- `v6_folien_teilen` ist live): der Speaker gibt beim Upload frei (`set_slides_release`,
-- nur mit Einwilligung `slides_publication`); das Teilnehmer-Portal zeigt die Folien.
--
-- Eine Datei erscheint genau dann, wenn **alles** gilt — der Dialog verspricht es den
-- Speakern wörtlich:
--   1. `speaker_asset.kind = 'presentation'`, `is_current`, `slides_release`
--      (alle drei, nicht nur die Freigabe — ältere Fassungen und andere Dateiarten nie);
--   2. die Session ist veröffentlicht (`session.publish_status = 'published'`);
--   3. der Slot ist vorbei (`now() > slot.end_at`);
--   4. die aufrufende Person ist angemeldet **und hat ein Ticket der Edition**
--      (`ticket.person_id = ich`, Status `valid` oder `checked_in`) — „nur für
--      Ticketinhaber der Edition" (TAL-001).
-- Zugeordnet wird über `speaker_asset.session_id → session → slot`; die Edition ist
-- `coalesce(event.edition_id, event.id)` der Session bzw. des Tickets.
--
-- Herausgegeben werden nur Dateiname, Session, Titel, Speaker-Name, Slot-Ende und der
-- Speicherpfad. Der Pfad verlässt den Server nicht: die Seite signiert ihn serverseitig
-- (Dienstschlüssel, kurze Laufzeit) und gibt nur die signierte Adresse ins Browserfenster.
-- `speaker-assets` bleibt privat, seine Policy unverändert. Nichts wird zwischengespeichert:
-- wird eine Freigabe zurückgenommen oder kommt eine neue Fassung, fehlt die Datei beim
-- nächsten Aufruf.
--
-- Fehlerschlüssel: 28000 ohne Person. Kein Ticket ⇒ leere Liste (kein Fehler — die Seite
-- erklärt, warum nichts da ist).
-- Test: supabase/tests/v6_folien_teilnehmende.sql
set search_path = public, extensions;

create or replace function my_session_slides()
returns table (asset_id uuid, session_id uuid, session_title_de text, session_title_en text,
               speaker_name text, filename text, storage_path text, slot_end_at timestamptz,
               edition_id uuid)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_me uuid := current_person_id();
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return query
    select sa.id, s.id, s.title_de, s.title_en,
           nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''),
           sa.filename, sa.storage_path, sl.end_at,
           coalesce(ev.edition_id, ev.id)
      from speaker_asset sa
      join session s        on s.id = sa.session_id
      join slot sl          on sl.id = s.slot_id
      join event ev         on ev.id = s.event_id
      join speaker_profile sp on sp.id = sa.profile_id
      left join person p    on p.id = sp.person_id
     where sa.kind = 'presentation'
       and sa.is_current
       and sa.slides_release
       and s.publish_status = 'published'
       and now() > sl.end_at
       and exists (
         select 1 from ticket t join event te on te.id = t.event_id
          where t.person_id = v_me
            and t.status in ('valid', 'checked_in')
            and coalesce(te.edition_id, te.id) = coalesce(ev.edition_id, ev.id)
       )
     order by sl.end_at, s.title_de, sa.filename;
end $$;

comment on function my_session_slides() is
  'TAL-001: freigegebene Präsentationen veröffentlichter, vergangener Sessions der Editionen, für die die Person ein Ticket hat. Pfad nur für die serverseitige Signatur.';

select harden_definer_functions();

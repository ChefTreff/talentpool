-- 0242 · Medienverwaltung: zweites Loom der Event-App am Schlüssel partner_event_app (ADM-009, ADM-063)
-- Angewendet von der Architektur-Session am 01.10.2026 als 20261001130657.
-- Event-App-Loom am Schlüssel partner_event_app (ADM-009, Teil von ADM-063)
--
-- Zweck: Das zweite Loom der Event-App (`67013b2c5a1a42cfbd2ee1a045a9bc5c`)
-- war nirgends hinterlegt. Konrad 25.09.: „immer im Admin" — gepflegt wird es
-- ab jetzt in der Medienverwaltung (`/admin/medien`, Bereich Videos); diese
-- Migration trägt nur den bekannten Link einmal ein, damit
-- `/partner/event-app` ihn zeigt (PART-075 hat die Stelle dafür gebaut).
-- Kommt im November die neue Anleitung, tauscht Konrad den Link dort aus.
--
-- Keine Funktion, keine Personendaten: eine Zeile Stammdaten, idempotent über
-- die Adresse.
set search_path = public, extensions;

insert into portal_video (key, title_de, title_en, url, audience, sort_order)
select 'partner_event_app', 'Event-App: Anleitung', 'Event app: tutorial',
       'https://www.loom.com/share/67013b2c5a1a42cfbd2ee1a045a9bc5c', array['partner'], 20
 where not exists (
   select 1 from portal_video v
    where v.key = 'partner_event_app' and v.url like '%67013b2c5a1a42cfbd2ee1a045a9bc5c%');

select harden_definer_functions();

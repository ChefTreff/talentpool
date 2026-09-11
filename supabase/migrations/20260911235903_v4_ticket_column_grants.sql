-- 0074 · `ticket`: Tabellen-Grant durch Spalten-Grants ersetzen (Vorschlag Build-Session PR #23, geprüft und angewendet von der Architektur-Session am 11.09.2026).
--
-- Fund aus PR 23 (Welle 4): `authenticated` hat `grant select on ticket` — einen **Tabellen**-Grant. Damit liest jede
-- angemeldete Person alle Spalten ihrer eigenen Tickets (RLS `ticket_self_sel` grenzt die Zeilen ein, nicht die Spalten),
-- also auch `team_note` (interne Notiz des Teams), `meta`, `extra_fields`, Preise und die vivenu-Kennungen.
-- Ein Spalten-Revoke greift gegen einen Tabellen-Grant nicht (docs/db-konventionen.md §5, Fund aus 0032).
--
-- Entscheidung Konrad (11.09.2026): „Die Person sollte eigentlich nichts von den eigenen Tickets sehen können, ausser den Code."
--
-- Geprüft, was die Oberfläche wirklich direkt aus der Tabelle liest:
--   app/(talent)/meine/page.tsx  →  select("event_id, person_id").eq("status", "valid")
-- Alles andere läuft über SECURITY-DEFINER-RPCs (`my_speaker_tickets`, `my_ticket_allocations`, `personalize_ticket`),
-- die von Grants unberührt sind. Der Spalten-Grant kann deshalb sehr schmal sein.
--
set search_path = public, extensions;

revoke select on ticket from authenticated;

-- `barcode` = der Code, den die Person braucht. `id`, `event_id`, `person_id` und `status` trägt die Ticketpflicht-Prüfung
-- auf /meine; ohne sie liesse sich die Zeile nicht einmal finden.
grant select (id, event_id, person_id, status, barcode) on ticket to authenticated;

select harden_definer_functions();

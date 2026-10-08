-- 00NN · „Allgemeine Zeiten und Auskünfte" abschaffen: Tabelle edition_info und ihre fünf Funktionen entfernen (ADM-100)
--
-- Anlass: Konrad 08.10.2026 (Admin-Feedback Teil 1, ADM-100): „Allgemeine Zeiten und Auskünfte — was sind das für
-- Daten, wofür?" Plan-Prüfung: **live 0 Zeilen in `edition_info`, nie genutzt** (frei definierbare Auskünfte je
-- Edition und Zielgruppe, F9.1, gedacht für Öffnungs- oder Help-Desk-Zeiten im Kontaktbereich der Portale).
-- Entscheidung Konrad: erstmal streichen. Geöffnete Zeiten stehen im Wiki.
--
-- Entfernt:
--   * Tabelle `edition_info` (samt Index und Policies);
--   * `edition_infos` (Leser der Portale), `edition_infos_admin`, `upsert_edition_info`, `delete_edition_info`;
--   * `can_edit_edition_info` (nur von diesen Funktionen benutzt; geprüft über die Abhängigkeiten — ein `drop`
--     ohne `cascade` bricht ab, falls doch etwas daran hängt).
-- Bleibt unverändert: `edition_contact` und alles Ansprechpartner-Wesen (`edition_contacts_admin`, `my_contacts`,
-- `upsert_edition_contact`, `can_edit_edition_contacts`).
--
-- **Datenschutz vor Löschen:** die Migration bricht ab (`edition_info_not_empty`), wenn inzwischen doch eine Zeile
-- in `edition_info` steht. Einen Eintrag stillschweigend wegzuwerfen wäre das Gegenteil von „nur deaktivieren,
-- nie löschen"; dann muss jemand entscheiden.
-- Das Audit-Protokoll bleibt (frühere Einträge `edition_info.*` gibt es bei 0 Zeilen höchstens als Test).
-- Code, Seiten und Wörterbuchschlüssel im selben PR entfernt (Admin-Karte, Partner-Startseite, Lader).
set search_path = public, extensions;

do $$
begin
  if exists (select 1 from edition_info) then
    raise exception 'edition_info_not_empty' using errcode = 'P0001',
      detail = (select count(*)::text from edition_info) || ' Zeilen';
  end if;
end $$;

drop function if exists edition_infos(text, uuid);
drop function if exists edition_infos_admin(uuid);
drop function if exists upsert_edition_info(jsonb);
drop function if exists delete_edition_info(uuid);
drop function if exists can_edit_edition_info();
drop table if exists edition_info;

select harden_definer_functions();

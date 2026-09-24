-- 0176 · Verkehrsmittel „Fernbus“ und „Wohnt in Hamburg“ stillgelegt (SPK-059)
-- Angewendet von der Architektur-Session am 24.09.2026 als 20260924193425.
--
-- Vorschlag der Build-Session Speaker-Domäne. Nummer, Anwenden, Umbenennen und
-- der Eintrag ins Entscheidungslog gehören der Architektur-Session.
--
-- Anlass: Konrad am 24.09. (Sichtprüfung `/speaker/travel`): „Fernbus“ und
-- „Wohnt in Hamburg“ raus.
--
-- **Stilllegen, nicht löschen:** An bestehenden Anreisen darf der Wert stehen
-- bleiben und behält sein Label (`loadVocabMap` lädt alle Begriffe). Angeboten
-- wird im Formular nur noch, was `active` ist (`loadActiveKeys`, im selben PR).
-- Derselbe Schalter steht in `/admin/vokabular`; als Migration ist die
-- Entscheidung im Repo nachvollziehbar.
--
-- Nur Daten, keine Funktion, keine Rechte, keine Fehlerschlüssel.

set search_path = public, extensions;

update vocab_term
   set active = false
 where vocabulary = 'travel_mode'
   and key in ('fernbus', 'vor_ort')
   and active;

select harden_definer_functions();

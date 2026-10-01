-- 0239 · Bucket partner-assets: Dateigrenze 100 MB für Druckdaten (HACK-018)
-- Angewendet von der Architektur-Session am 01.10.2026 als 20261001125729.
--
-- Zweck: Die Pflichtdatei `hackathon_backdrop` (Druckdaten der Rückwand, 0223/HACK-005) erlaubt im
-- Template 100 MB, der gemeinsame Bucket `partner-assets` ließ aber nur 50 MB zu — ein Upload zwischen
-- 50 und 100 MB scheiterte am Bucket, obwohl das Formular ihn annahm (Fund Talent-Chat, #284).
-- Entscheidung Architektur-Session: kein eigener Bucket, die Grenze des Buckets steigt auf 100 MB;
-- die Typliste bleibt unverändert, Pfadregel und Policies ebenso.
--
-- Rechte: keine Änderung (nur storage.buckets.file_size_limit). Fehlerschlüssel: keine.
-- Test: supabase/tests/v6_partner_assets_grenze.sql

update storage.buckets
   set file_size_limit = 104857600
 where id = 'partner-assets' and coalesce(file_size_limit, 0) < 104857600;

select harden_definer_functions();

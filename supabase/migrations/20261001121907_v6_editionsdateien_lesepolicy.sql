-- 0232 · Editionsdateien: Lesen im Bucket edition-files nur für die Zielgruppe der Datei (Security-Check Teil 3, L-S1)
-- Angewendet von der Architektur-Session am 01.10.2026 als 20261001121907.
-- Zweck: Die Policy „edition files read“ (v5_messestand) erlaubte jeder angemeldeten Person das Lesen
-- und Signieren aller Objekte im Bucket `edition-files` — unabhängig von `edition_file.audience`.
-- Die Fachfunktion `edition_files(p_audience)` filtert zwar die Liste, aber wer einen Pfad kannte
-- oder den Bucket auflistete, kam an jede Datei (Hallenplan nur für Speaker, Media Kit nur für
-- Partner …). Jetzt: Pfadregel `edition_file_path_allowed(name)` wie bei den übrigen privaten
-- Buckets — das Team (admin, Produktion, Marketing) liest alles; sonst nur Dateien, deren
-- Zielgruppe zu den eigenen Zielgruppen (`my_kb_audiences()`) gehört; Vorschaubilder
-- (`preview_path`) folgen ihrer Datei. Objekte ohne Zeile in `edition_file` (Reste nach einer
-- Löschung) liest nur das Team. Schreiben bleibt wie bisher nur über signierte Upload-Adressen des
-- Servers (keine Insert-Policy); die Server-Routen signieren mit service_role und sind unberührt.
--
-- Rechte: Funktion SECURITY DEFINER, search_path gepinnt, EXECUTE für authenticated (die Policy
-- läuft in deren Kontext), nichts für anon oder public. Keine Spalten, keine Tabellen-Grants.
-- Fehlerschlüssel: keine (Policy liefert 0 Zeilen bzw. „Object not found“ beim Signieren).
-- Test: supabase/tests/v6_editionsdateien_lesepolicy.sql

create or replace function edition_file_path_allowed(p_name text)
returns boolean
language plpgsql
stable security definer
set search_path to 'public', 'extensions'
as $$
begin
  if current_person_id() is null or p_name is null then return false; end if;
  if coalesce(is_staff() or is_production_team() or is_marketing_team(), false) then return true; end if;
  return exists (
    select 1 from edition_file f
     where (f.storage_path = p_name or f.preview_path = p_name)
       and f.audience && my_kb_audiences()
  );
end $$;

revoke all on function edition_file_path_allowed(text) from public, anon;
grant execute on function edition_file_path_allowed(text) to authenticated;

comment on function edition_file_path_allowed(text) is
  'Pfadregel (0232) für den Bucket edition-files: Team liest alles, sonst nur Dateien (und ihre Vorschau), deren audience zu my_kb_audiences() gehört.';

drop policy if exists "edition files read" on storage.objects;
create policy "edition files read" on storage.objects
  for select to authenticated
  using (bucket_id = 'edition-files' and edition_file_path_allowed(name));

select harden_definer_functions();

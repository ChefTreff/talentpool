-- 00NN · Verkleinerte Vorschau für Editionsbilder (ADM-042, Konrad 25.09.2026: „ja, passt")
--
-- Zweck: Konrads Hallenplan ist 8503 × 6062 Pixel (gut 51 Megapixel, 2,9 MB).
-- Er wird richtig angezeigt, aber der Browser braucht Sekunden zum Dekodieren;
-- auf einem Telefon ist das der Unterschied zwischen „lädt kurz" und „lädt
-- nicht" (gemessen von der Speaker-Session, 18.09.). Beim Upload entsteht jetzt
-- eine verkleinerte Fassung; die Portale zeigen sie und verlinken das Original
-- zum Herunterladen.
--
-- Gehört an die Edition, nicht in jedes Portal: die Datei hängt einmal dort,
-- und alle drei Anzeigeorte (Partner-Messestand, Partner-Media, Speaker-Session)
-- lesen dieselbe Zeile.
--
-- Teile:
--   * `edition_file.preview_path`, `preview_width`, `preview_height`. Leer
--     heisst: keine Vorschau (PDF, SVG, oder die Erzeugung ist gescheitert) —
--     dann zeigen die Portale weiter das Original.
--   * Der Pfad ist fest: `<storage_path>.preview.webp`. So kann das Löschen
--     beide Dateien entfernen, ohne dass `delete_edition_file` einen zweiten
--     Wert zurückgeben muss.
--   * `set_edition_file_preview(id, path, w, h)` — **nur Server**: die
--     Vorschau entsteht in der Upload-Route nach der Rollenprüfung, nicht im
--     Browser. Ein Browser, der hier schreiben dürfte, könnte einen Eintrag auf
--     eine beliebige Datei zeigen lassen.
--   * `edition_files` gibt die drei Spalten mit aus (Rückgabetyp ⇒ drop + create;
--     Basis: snapshot/functions/edition_files.sql).
set search_path = public, extensions;

alter table edition_file
  add column preview_path text,
  add column preview_width integer,
  add column preview_height integer;

alter table edition_file
  add constraint edition_file_preview_chk check (
    preview_path is null
    or (preview_path = storage_path || '.preview.webp'
        and preview_width between 1 and 10000 and preview_height between 1 and 10000));

comment on column edition_file.preview_path is
  'Verkleinerte WebP-Fassung für die Anzeige (ADM-042), immer <storage_path>.preview.webp. Leer = keine Vorschau, Portale zeigen das Original.';

-- ---------------------------------------------------------------------------
create or replace function set_edition_file_preview(p_id uuid, p_path text, p_width integer, p_height integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_storage text;
begin
  -- Nur der Server nach der Rollenprüfung der Route; eine Sitzung hat hier nichts zu tun.
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  select f.storage_path into v_storage from edition_file f where f.id = p_id;
  if not found then raise exception 'edition_file_not_found' using errcode = 'P0002', detail = coalesce(p_id::text, 'null'); end if;
  if p_path is distinct from v_storage || '.preview.webp' then
    raise exception 'invalid_path' using errcode = '22023', detail = coalesce(p_path, 'null');
  end if;
  update edition_file
     set preview_path = p_path, preview_width = p_width, preview_height = p_height, updated_at = now()
   where id = p_id;
end $$;

revoke execute on function set_edition_file_preview(uuid, text, integer, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
drop function if exists edition_files(text, uuid);
create function edition_files(p_audience text, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, kind text, storage_path text, filename text, mime text, size_bytes bigint, label_de text, label_en text, created_at timestamp with time zone, preview_path text, preview_width integer, preview_height integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  -- Dieselbe Regel wie im Wiki: die Zielgruppe wird aus den Rollen abgeleitet,
  -- nicht geglaubt.
  if not (my_kb_audiences() && array[p_audience]) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition
                                  order by (current_date between e.start_date and e.end_date) desc,
                                           e.start_date desc limit 1))
    into v_ed;
  return query
    select f.id, f.kind, f.storage_path, f.filename, f.mime, f.size_bytes,
           f.label_de, f.label_en, f.created_at,
           f.preview_path, f.preview_width, f.preview_height
      from edition_file f
     where f.edition_id = v_ed
       and f.audience && array[p_audience]
     order by f.sort_order, f.created_at desc;
end $$;

select harden_definer_functions();

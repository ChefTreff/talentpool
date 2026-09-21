# Funktions-Snapshot (Live-Fassung)

`functions/<name>.sql` ist die Live-Fassung jeder Funktion im Schema `public`, erzeugt aus
`pg_get_functiondef` mit `sh scripts/db.sh snapshot` — ausschließlich von der Architektur-/Security-Session,
nach jedem Anwenden einer Migration, committet auf `main`. Überladene Funktionen tragen die Argumenttypen
im Dateinamen (`name--uuid_text.sql`).

Regeln (seit 18.09.2026, `docs/db-konventionen.md` §1):
- Wer eine bestehende Funktion per `create or replace` ändert, kopiert die Datei aus diesem Ordner in die
  Migration und ändert genau die betroffenen Zeilen. `git diff --no-index supabase/snapshot/functions/<name>.sql <migration-ausschnitt>` zeigt, was sich ändert; die Architektur-Session prüft dasselbe mit `db.sh fn-diff`.
- Der Ordner wird **nie von Hand** bearbeitet und nie in Bau-Branches geändert; er beschreibt den Stand der
  Datenbank, nicht den Wunsch.
- Die Dateien sind Migrationsform: Kopf in Kleinschreibung ohne `public.`, `$$` statt `$function$`, Semikolon
  am Ende — sie lassen sich direkt in eine Migration übernehmen.

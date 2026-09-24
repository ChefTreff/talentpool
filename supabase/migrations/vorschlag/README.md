# Vorschläge der Build-Chats

Hier liegen Migrationsvorschläge **ohne Nummer** (`<name>.sql`, Test unter `supabase/tests/<name>.sql`, Regeln in `docs/db-konventionen.md`). Anwenden, Nummer, Umbenennen nach `supabase/migrations/<version>_<name>.sql` und der Eintrag ins Entscheidungslog gehören der Architektur-Session.

Diese Datei bleibt absichtlich liegen: Ist das Verzeichnis auf `main` leer, hält Git beim Rebase das Ausräumen für eine Verzeichnis-Umbenennung und verschiebt neue Vorschläge nach `supabase/migrations/` (Befund Speaker-Chat 24.09.2026, „CONFLICT file location“). Mit einer versionierten Datei passiert das nicht. Nach jedem Rebase trotzdem `git ls-files supabase/migrations` ansehen.

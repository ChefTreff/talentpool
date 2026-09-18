#!/bin/sh
# Datenbankzugriff der Architektur-Session direkt aus Dateien (18.09.2026) — Einstieg für scripts/db.mjs (Node + pg; kein psql auf diesem Mac).
#   sh scripts/db.sh check                                   Verbindung: Server, Datenbank, Rolle, jüngste Migrationen
#   sh scripts/db.sh test    supabase/tests/<t>.sql           Smoke-Test ausführen (Datei bringt begin/rollback selbst mit)
#   sh scripts/db.sh dry-run <migration.sql> [<test.sql>]     Migration + Test in EINER Transaktion, am Ende rollback — Probelauf vor dem Anwenden
#   sh scripts/db.sh fn-diff <migration.sql>                  je `create or replace function` den Live-Text gegen die neue Fassung stellen (Konvention §1)
#   sh scripts/db.sh apply   <migration.sql> <name>           anwenden + Eintrag in supabase_migrations.schema_migrations; gibt die Server-Version aus
# Verbindungs-URL: ~/.config/fls27/db.env (sh scripts/db-url-set.sh) — nie in .env.local oder Vercel.
set -eu
R="$(cd "$(dirname "$0")/.." && pwd)"
command -v node >/dev/null 2>&1 || . "$HOME/.zshenv"
[ -d "$R/node_modules/pg" ] || { echo "pg fehlt: im Repo einmal 'npm install' ausführen" >&2; exit 2; }
exec node "$R/scripts/db.mjs" "$@"

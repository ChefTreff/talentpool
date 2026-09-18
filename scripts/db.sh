#!/bin/sh
# Datenbankzugriff der Architektur-Session per psql, direkt aus Dateien — die Migration wandert nicht als Text durch den Chat (18.09.2026).
# Die Verbindungs-URL liegt AUSSERHALB des Repos in ~/.config/fls27/db.env (sh scripts/db-url-set.sh); Bau-Chats haben sie nicht.
# Aufruf:
#   sh scripts/db.sh check                                   Verbindung prüfen: Server, Datenbank, Rolle, jüngste Migrationen
#   sh scripts/db.sh test    supabase/tests/<t>.sql           Smoke-Test ausführen (die Datei bringt begin/rollback selbst mit)
#   sh scripts/db.sh dry-run <migration.sql> [<test.sql>]     Migration + Test in EINER Transaktion, am Ende rollback — der Probelauf vor dem Anwenden
#   sh scripts/db.sh fn-diff <migration.sql>                  je `create or replace function` den Live-Text (pg_proc.prosrc) gegen die neue Fassung stellen (Konvention §1)
#   sh scripts/db.sh apply   <migration.sql> <name>           anwenden + Eintrag in supabase_migrations.schema_migrations (wie MCP apply_migration); gibt die Server-Version aus
set -eu
ENVF="$HOME/.config/fls27/db.env"
[ -r "$ENVF" ] || { echo "Keine Datenbank-URL hinterlegt: sh scripts/db-url-set.sh" >&2; exit 2; }
# shellcheck disable=SC1090
. "$ENVF"
: "${SUPABASE_DB_URL:?SUPABASE_DB_URL fehlt in $ENVF}"
PSQL="$(command -v psql 2>/dev/null || true)"
for p in /opt/homebrew/opt/libpq/bin/psql /usr/local/opt/libpq/bin/psql; do
  [ -z "$PSQL" ] && [ -x "$p" ] && PSQL="$p"
done
[ -n "$PSQL" ] || { echo "psql fehlt: brew install libpq" >&2; exit 2; }
run() { "$PSQL" "$SUPABASE_DB_URL" -X -q -v ON_ERROR_STOP=1 "$@"; }
tmp="$(mktemp)"; trap 'rm -f "$tmp" "$tmp.live" "$tmp.neu"' EXIT
cmd="${1:-}"; [ $# -gt 0 ] && shift
case "$cmd" in
  check)
    run -c "select left(version(), 40) as server, current_database() as db, current_user as rolle;" \
        -c "select version, name from supabase_migrations.schema_migrations order by version desc limit 3;" ;;
  test)
    f="${1:?Testdatei angeben}"
    run -f "$f" ;;
  dry-run)
    m="${1:?Migrationsdatei angeben}"; t="${2:-}"
    { echo "begin;"; cat "$m"; echo
      if [ -n "$t" ]; then sed -e '/^begin;[[:space:]]*$/d' -e '/^rollback;[[:space:]]*$/d' "$t"; fi
      echo "rollback;"; } > "$tmp"
    run -f "$tmp" && echo "PROBELAUF OK — alles zurückgerollt" ;;
  fn-diff)
    m="${1:?Migrationsdatei angeben}"; rc=0
    for fn in $(grep -oiE 'create or replace function[[:space:]]+[a-z_0-9]+[[:space:]]*\(' "$m" | sed -E 's/.*function[[:space:]]+//; s/[[:space:]]*\(//' | sort -u); do
      run -At -c "select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = '$fn'" > "$tmp.live"
      if [ ! -s "$tmp.live" ]; then echo "== $fn: NEU (live nicht vorhanden)"; continue; fi
      FN="$fn" perl -0777 -ne 'my $f = $ENV{FN}; if (/create or replace function\s+\Q$f\E\s*\(.*?\bas\s+\$\$(.*?)\$\$;/si) { print $1 }' "$m" > "$tmp.neu" 2>/dev/null || true
      if diff -qw "$tmp.live" "$tmp.neu" > /dev/null; then echo "== $fn: unverändert gegen live"
      else echo "== $fn: ÄNDERUNG gegen live (< live | > neu)"; diff -w "$tmp.live" "$tmp.neu" | head -80; rc=1; fi
    done
    exit $rc ;;
  apply)
    m="${1:?Migrationsdatei angeben}"; name="${2:?Name angeben, z. B. v6_formate}"
    case "$name" in *[!a-z0-9_]*) echo "Name nur aus a-z, 0-9, _" >&2; exit 2 ;; esac
    grep -q 'harden_definer_functions' "$m" || { echo "Migration endet nicht mit select harden_definer_functions();" >&2; exit 2; }
    v="$(date -u +%Y%m%d%H%M%S)"
    { echo "begin;"; cat "$m"; echo
      echo "insert into supabase_migrations.schema_migrations (version, name, statements) values ('$v', '$name', array[\$mig\$"; cat "$m"; echo "\$mig\$]);"
      echo "commit;"; } > "$tmp"
    run -f "$tmp" && echo "ANGEWENDET als $v ($name) — Datei umbenennen nach supabase/migrations/${v}_${name}.sql, Kopfvermerk setzen, Entscheidungslog" ;;
  *)
    sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac

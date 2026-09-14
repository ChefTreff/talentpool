#!/bin/sh
# Finder-/Sync-Duplikate entfernen („name 2.ts", „name 3.json").
#
# Auf diesem Mac laufen Google Drive und iCloud gleichzeitig; im Projektordner
# unter ~/Documents tauchen dadurch Kopien auf. In `.next` brechen sie `tsc`
# („Duplicate identifier"), im Quellcode wuerden sie das PR-Gate rot machen
# (scripts/gate-pr.sh, Repo-Hygiene 14.09.2026).
#
# Aufruf: sh scripts/clean-dupes.sh [--dry-run]
set -e
muster=' [0-9].*'
gefunden="$(find . -name "$muster" -not -path './node_modules/*' -not -path './.git/*' 2>/dev/null || true)"
if [ -z "$gefunden" ]; then echo "keine Duplikate"; exit 0; fi
echo "$gefunden"
if [ "$1" = "--dry-run" ]; then echo "— nichts geloescht (--dry-run)"; exit 0; fi
printf '%s\n' "$gefunden" | while IFS= read -r f; do rm -f "$f"; done
echo "— entfernt: $(printf '%s\n' "$gefunden" | wc -l | tr -d ' ')"

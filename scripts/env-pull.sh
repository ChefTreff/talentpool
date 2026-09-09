#!/bin/sh
# Vercel-Env nach .env.local holen und dabei den lokal eingetragenen SUPABASE_SECRET_KEY bewahren.
#
# Hintergrund: Die Vercel↔Supabase-Integration legt SUPABASE_SECRET_KEY (und SUPABASE_JWT_SECRET) als
# "sensitive" an. `vercel env pull` liefert für solche Variablen keinen Wert, sondern einen Platzhalter
# (11 Zeichen, kein `sb_secret_`-Präfix). Der Admin-Bereich und die Diagnose-Skripte brauchen den echten
# Wert. Konrad trägt ihn einmal von Hand in .env.local ein (Supabase → Project Settings → API Keys →
# Secret keys); dieses Skript übernimmt ihn bei jedem weiteren Pull, solange Vercel nur den Platzhalter liefert.
#
# Aufruf:  sh scripts/env-pull.sh [production|preview|development] [--worktrees]
#          --worktrees kopiert das Ergebnis zusätzlich in jeden Worktree unter .claude/worktrees/*, der schon eine .env.local hat.
set -eu
cd "$(dirname "$0")/.."
ENVIRONMENT="production"; COPY_WT=0
for a in "$@"; do
  case "$a" in
    --worktrees) COPY_WT=1 ;;
    production|preview|development) ENVIRONMENT="$a" ;;
    *) echo "Unbekanntes Argument: $a" >&2; exit 2 ;;
  esac
done
tmp="$(mktemp)"; trap 'rm -f "$tmp" "$tmp.2"' EXIT
vercel env pull "$tmp" --environment "$ENVIRONMENT" --scope chef-treff --yes >/dev/null
is_key() { case "${1:-}" in sb_secret_*|eyJ*) return 0 ;; *) return 1 ;; esac; }
pulled="$(grep -E '^SUPABASE_SECRET_KEY=' "$tmp" | head -1 | cut -d= -f2- | tr -d '"' || true)"
local_="$(grep -E '^SUPABASE_SECRET_KEY=' .env.local 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || true)"
if ! is_key "$pulled"; then
  if is_key "$local_"; then
    grep -vE '^SUPABASE_SECRET_KEY=' "$tmp" > "$tmp.2" && mv "$tmp.2" "$tmp"
    printf 'SUPABASE_SECRET_KEY="%s"\n' "$local_" >> "$tmp"
    echo "SUPABASE_SECRET_KEY: lokalen Wert bewahrt (Vercel liefert für sensible Variablen nur einen Platzhalter)."
  else
    echo "HINWEIS: SUPABASE_SECRET_KEY ist nur ein Platzhalter. Echten Wert aus Supabase → Project Settings → API Keys → Secret keys in .env.local eintragen (Admin-Bereich und Skripte brauchen ihn), danach dieses Skript erneut ausführen." >&2
  fi
fi
cp "$tmp" .env.local
echo ".env.local aktualisiert ($ENVIRONMENT): $(grep -cE '^[A-Z_]+=' .env.local) Variablen."
if [ "$COPY_WT" = 1 ]; then
  for d in .claude/worktrees/*/; do
    [ -f "$d.env.local" ] && cp .env.local "$d.env.local" && echo "kopiert nach $d.env.local"
  done
fi

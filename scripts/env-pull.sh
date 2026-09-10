#!/bin/sh
# Vercel-Env nach .env.local holen, ohne Platzhalter für sensible Variablen zu übernehmen.
#
# Hintergrund: Die Vercel↔Supabase-Integration legt geheime Werte (SUPABASE_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY,
# SUPABASE_JWT_SECRET, POSTGRES_*) als "sensitive" an. `vercel env pull` liefert dafür keinen Wert, sondern den
# Platzhalter [SENSITIVE]. Ein Platzhalter als Wert ist schlimmer als keine Variable: der Code würde ihn vor dem
# nächsten gültigen Namen lesen ("Invalid API key"). Deshalb:
#   - Platzhalter-Zeilen werden verworfen,
#   - außer es steht in der bestehenden .env.local schon ein echter, lokal eingetragener Wert: der bleibt erhalten.
# Den echten SUPABASE_SECRET_KEY trägt Konrad einmal von Hand ein (Supabase → Project Settings → API Keys → Secret keys),
# danach übernimmt ihn jeder weitere Lauf.
#
# Aufruf:  sh scripts/env-pull.sh [production|preview|development] [--worktrees]
#          --worktrees kopiert das Ergebnis in jeden Worktree unter .claude/worktrees/*, der schon eine .env.local hat.
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
tmp="$(mktemp)"; out="$(mktemp)"; trap 'rm -f "$tmp" "$out"' EXIT
vercel env pull "$tmp" --environment "$ENVIRONMENT" --scope chef-treff --yes >/dev/null

value_of() { grep -E "^$1=" "$2" 2>/dev/null | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' || true; }
is_placeholder() { case "${1:-}" in ""|"[SENSITIVE]"|"<"*">") return 0 ;; *) return 1 ;; esac; }

kept=""; dropped=""
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    [A-Z_]*=*)
      name="${line%%=*}"; val="$(printf '%s' "${line#*=}" | sed -e 's/^"//' -e 's/"$//')"
      if is_placeholder "$val"; then
        local_="$(value_of "$name" .env.local)"
        if ! is_placeholder "$local_"; then
          printf '%s="%s"\n' "$name" "$local_" >> "$out"; kept="$kept $name"
        else
          dropped="$dropped $name"
        fi
        continue
      fi ;;
  esac
  printf '%s\n' "$line" >> "$out"
done < "$tmp"

# Lokal ergänzte Variablen (z. B. CRON_SECRET für den Dev-Server), die Vercel nicht liefert, bleiben erhalten.
if [ -f .env.local ]; then
  extra=""
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      [A-Z_]*=*) name="${line%%=*}"; grep -qE "^$name=" "$out" || extra="$extra$line\n" ;;
    esac
  done < .env.local
  if [ -n "$extra" ]; then printf "\n# lokal ergänzt (nicht aus Vercel)\n$extra" >> "$out"; echo "Lokal ergänzte Variablen bewahrt: $(printf "$extra" | cut -d= -f1 | tr "\n" " ")"; fi
fi
cp "$out" .env.local
echo ".env.local aktualisiert ($ENVIRONMENT): $(grep -cE '^[A-Z_]+=' .env.local) Variablen."
[ -n "$kept" ] && echo "Lokal eingetragene Werte bewahrt:$kept"
[ -n "$dropped" ] && echo "Weggelassen (leer oder in Vercel sensibel, Platzhalter verworfen):$dropped"
secret="$(value_of SUPABASE_SECRET_KEY .env.local)"
case "$secret" in
  sb_secret_*|eyJ*) echo "SUPABASE_SECRET_KEY: vorhanden, Format ok." ;;
  *) echo "HINWEIS: SUPABASE_SECRET_KEY fehlt lokal. Wert aus Supabase → Project Settings → API Keys → Secret keys als Zeile" >&2
     echo '        SUPABASE_SECRET_KEY="sb_secret_…"  in .env.local eintragen (Admin-Bereich und Skripte brauchen ihn), dann dieses Skript erneut ausführen.' >&2 ;;
esac
if [ "$COPY_WT" = 1 ]; then
  for d in .claude/worktrees/*/; do
    [ -f "$d.env.local" ] && cp .env.local "$d.env.local" && echo "kopiert nach $d.env.local"
  done
fi

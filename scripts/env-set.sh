#!/bin/sh
# Eine Variable an EINER Stelle setzen: in Vercel (production, preview, development) und lokal in .env.local (+ Worktrees).
# Der Wert wird unsichtbar abgefragt und landet weder in der Shell-History noch im Chat oder Repo.
#
# Aufruf:  sh scripts/env-set.sh NAME [--config] [--no-local]
#   Standard    sensibel in Vercel (Wert dort nicht mehr lesbar) + lokal in .env.local
#   --config    nicht sensibel (Wert in Vercel lesbar, `env-pull.sh` holt ihn künftig automatisch) – für IDs, URLs, Schalter
#   --no-local  nur Vercel; für Werte, die kein lokales Skript braucht (RESEND_API_KEY, SEVDESK_API_TOKEN, …)
# Ohne Terminal (z. B. `printf '%s' "$WERT" | sh scripts/env-set.sh NAME`) wird der Wert von stdin gelesen.
# ENV_FILE überschreibt den Zielpfad der lokalen Datei (nur für Tests).
set -eu
cd "$(dirname "$0")/.."
NAME=""; SENS="--sensitive"; LOCAL=1
for a in "$@"; do
  case "$a" in
    --config) SENS="--no-sensitive" ;;
    --no-local) LOCAL=0 ;;
    -*) echo "Unbekanntes Argument: $a" >&2; exit 2 ;;
    *) NAME="$a" ;;
  esac
done
[ -n "$NAME" ] || { echo "Aufruf: sh scripts/env-set.sh NAME [--config] [--no-local]" >&2; exit 2; }
case "$NAME" in
  [A-Z_]*) case "$NAME" in *[!A-Z0-9_]*) echo "Ungültiger Name: $NAME (nur GROSSBUCHSTABEN, Ziffern, _)" >&2; exit 2 ;; esac ;;
  *) echo "Ungültiger Name: $NAME (nur GROSSBUCHSTABEN, Ziffern, _)" >&2; exit 2 ;;
esac

if [ -t 0 ]; then
  printf 'Wert für %s (Eingabe unsichtbar, Enter bestätigt): ' "$NAME"
  stty -echo; trap 'stty echo' EXIT INT TERM
  IFS= read -r VALUE
  stty echo; trap - EXIT INT TERM; printf '\n'
else
  IFS= read -r VALUE || true
fi
VALUE="$(printf '%s' "$VALUE" | tr -d '\r')"
[ -n "$VALUE" ] || { echo "Leerer Wert – abgebrochen." >&2; exit 1; }
case "$VALUE" in "[SENSITIVE]"|"<"*">") echo "Das sieht nach einem Platzhalter aus – abgebrochen." >&2; exit 1 ;; esac

# Vercel: alle drei Umgebungen, vorhandene Werte werden überschrieben
if printf '%s' "$VALUE" | vercel env add "$NAME" production,preview,development $SENS --force --scope chef-treff --yes >/dev/null 2>&1; then
  ENVS="production, preview, development"
elif printf '%s' "$VALUE" | vercel env add "$NAME" production,preview $SENS --force --scope chef-treff --yes >/dev/null 2>&1; then
  ENVS="production, preview (development lässt Vercel für diesen Typ nicht zu)"
else
  echo "Vercel: Setzen von $NAME fehlgeschlagen – bist du eingeloggt (vercel whoami) und ist das Projekt verknüpft (.vercel/project.json)?" >&2
  exit 1
fi
[ "$SENS" = "--sensitive" ] && ART="sensibel" || ART="lesbar (Config)"
echo "Vercel: $NAME gesetzt – $ENVS, $ART."

if [ "$LOCAL" = 1 ]; then
  f="${ENV_FILE:-.env.local}"
  touch "$f"; chmod 600 "$f"
  tmp="$(mktemp)"
  grep -v "^$NAME=" "$f" > "$tmp" || true
  printf '%s=%s\n' "$NAME" "$VALUE" >> "$tmp"
  mv "$tmp" "$f"; chmod 600 "$f"
  echo "Lokal: $f aktualisiert."
  if [ -z "${ENV_FILE:-}" ]; then
    for d in .claude/worktrees/*/; do
      [ -f "$d.env.local" ] && cp "$f" "$d.env.local" && echo "kopiert nach $d.env.local"
    done
  fi
fi
unset VALUE

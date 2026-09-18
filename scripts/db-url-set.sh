#!/bin/sh
# Verbindungs-URL der Datenbank für die Architektur-Session hinterlegen — AUSSERHALB des Repos in ~/.config/fls27/db.env (nur Eigentümer lesbar).
# Nicht in .env.local (das wird in alle Worktrees kopiert; Bau-Chats sollen keine Datenbankverbindung haben) und nicht in Vercel (die App braucht sie nicht).
# Eingabe unsichtbar; nichts landet in Shell-History, Chat oder Repo.
# Erwartet die Session-Pooler-URI aus dem Supabase-Dashboard (Connect → Session pooler, Port 5432) mit eingesetztem Passwort;
# Sonderzeichen im Passwort URL-kodieren (@ → %40, # → %23, / → %2F, : → %3A).
set -eu
d="$HOME/.config/fls27"; f="$d/db.env"
mkdir -p "$d"; chmod 700 "$d"
if [ -t 0 ]; then
  printf 'SUPABASE_DB_URL (Eingabe unsichtbar, dann Enter): '
  stty -echo; read -r url; stty echo; printf '\n'
else
  read -r url
fi
case "$url" in postgresql://*|postgres://*) ;; *) echo "Keine postgresql://-URL, nichts gespeichert." >&2; exit 1 ;; esac
case "$url" in *"[YOUR-PASSWORD]"*|*"[PASSWORD]"*) echo "Platzhalter statt Passwort in der URL, nichts gespeichert." >&2; exit 1 ;; esac
umask 077; printf 'SUPABASE_DB_URL=%s\n' "$url" > "$f"; chmod 600 "$f"
echo "gespeichert: $f"
echo "prüfen: sh scripts/db.sh check"

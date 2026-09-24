#!/bin/sh
# Angewendete Migration einsortieren (Architektur-Session): Vorschlagsdatei → supabase/migrations/<version>_<name>.sql,
# erste Zeile = Nummer und Titel, zweite Zeile = Anwendungsvermerk. Datei wird per git add vorgemerkt (kein git mv:
# das scheitert bei noch nicht versionierten Dateien).
#   sh scripts/mig-file.sh <vorschlag.sql> <version14> <name> "<NNNN · Titel>"
set -eu
src="$1"; ver="$2"; name="$3"; titel="$4"
dst="supabase/migrations/${ver}_${name}.sql"
[ -f "$src" ] || { echo "Quelle fehlt: $src" >&2; exit 1; }
[ ! -e "$dst" ] || { echo "Ziel existiert schon: $dst" >&2; exit 1; }
mv "$src" "$dst"
node -e '
const fs=require("fs");const [f,ver,titel]=process.argv.slice(1);let t=fs.readFileSync(f,"utf8").split("\n");
if(/^-- \d{4} · /.test(t[0])) t[0]="-- "+titel; else t.unshift("-- "+titel);
t.splice(1,0,`-- Angewendet von der Architektur-Session am ${new Date().toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit",year:"numeric"})} als ${ver}.`);
fs.writeFileSync(f,t.join("\n"));' "$dst" "$ver" "$titel"
git add -A supabase/migrations
echo "→ $dst"
head -2 "$dst"

#!/bin/sh
# Spiegelt docs/*.md in den Drive-Projektordner (Team-Lesekopie). Quelle der Wahrheit bleibt das Repo.
# Aufruf: sh scripts/mirror-docs.sh   (nach jedem Doku-Commit)
set -e
DRIVE="/Users/konradgruner/Library/CloudStorage/GoogleDrive-konrad@chef-treff.de/Geteilte Ablagen/0 - Admin & Leadership/00 - Admin - KI Wissensordner/Admin - KI Projekte/AI Projekt - Talentpool & FLS27 Systeme"
[ -d "$DRIVE" ] || { echo "Drive-Ordner nicht gemountet: $DRIVE" >&2; exit 1; }
cd "$(dirname "$0")/.."
while IFS='|' read -r src dst; do
  [ -z "$src" ] && continue
  if [ -f "$src" ]; then cp "$src" "$DRIVE/$dst" && echo "✓ $src -> $dst"; else echo "fehlt: $src" >&2; fi
done <<'MAP'
docs/legacy-inventar.md|04_Tool-Landscape & Integrationen/Legacy-Inventar — Airtable, Notion, Swapcard-API, Vivenu-API (Claude, 2026-09-07).md
docs/makecom-webhooks-2026-09-08.md|04_Tool-Landscape & Integrationen/make.com — verwaiste Webhooks, Abschaltliste (2026-09-08).md
docs/vivenu-support-anfrage.md|04_Tool-Landscape & Integrationen/Vivenu-Support-Anfrage (Entwurf, 2026-09-08).md
docs/zugangs-liste.md|04_Tool-Landscape & Integrationen/Zugangs- und Token-Liste (ohne Werte, Claude, laufend).md
docs/feedback-fls26.md|05_Requirements (Team-Input)/Feedback FLS26 — Register mit Konsequenzen (Claude, 2026-09-08).md
docs/design-briefing.md|07_Mockups & Design/Design-Briefing v0.3 (Claude, 2026-09-08).md
docs/entscheidungen.md|08_Projektplan & MVP/Entscheidungslog (Claude, laufend).md
docs/abschluss-checkliste.md|08_Projektplan & MVP/Abschluss-Checkliste (Claude, laufend).md
docs/fragenkatalog-2026-09-07.md|08_Projektplan & MVP/Fragenkatalog Masterplan — bitte inline beantworten (2026-09-07).md
docs/masterplan.md|08_Projektplan & MVP/Masterplan FLS27-Plattform (Entwurf v0.1, 2026-09-08).md
docs/datenmodell-v2.md|08_Projektplan & MVP/Datenmodell v2 — Ueberblick (Claude, 2026-09-08).md
docs/schema.md|08_Projektplan & MVP/Schema (generiert aus der Datenbank, laufend).md
docs/arbeitsauftrag-welle-0.md|08_Projektplan & MVP/Arbeitsauftrag Welle 0 — Fundament (Claude, 2026-09-08).md
docs/arbeitsauftrag-welle-1.md|08_Projektplan & MVP/Arbeitsauftrag Welle 1 — Talent + Programm (Claude, 2026-09-08).md
docs/arbeitsauftrag-welle-2.md|08_Projektplan & MVP/Arbeitsauftrag Welle 2 — Speaker + Speaker-Leads (Claude, 2026-09-10).md
docs/arbeitsauftrag-welle-3.md|08_Projektplan & MVP/Arbeitsauftrag Welle 3 — Partner + Messeshop (Claude, 2026-09-10).md
MAP
# Runbooks als Ordner
if [ -d docs/runbooks ]; then
  mkdir -p "$DRIVE/08_Projektplan & MVP/Runbooks"
  for f in docs/runbooks/*.md; do cp "$f" "$DRIVE/08_Projektplan & MVP/Runbooks/$(basename "$f")" && echo "✓ $f -> Runbooks/"; done
fi

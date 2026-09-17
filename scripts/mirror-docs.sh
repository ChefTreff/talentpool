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
docs/sanity-trockenlauf-2026-09-15.md|04_Tool-Landscape & Integrationen/Sanity-Trockenlauf — Prüfergebnis für das Website-Team (2026-09-15).md
docs/website-team-sanity-briefing.md|04_Tool-Landscape & Integrationen/Sanity — Info an das Website-Team (Kontrakt v2, 2026-09-15).md
docs/feedback-fls26.md|05_Requirements (Team-Input)/Feedback FLS26 — Register mit Konsequenzen (Claude, 2026-09-08).md
docs/feedback-runde-1-2026-09-11.md|05_Requirements (Team-Input)/Feedback-Runde 1 — Konrad (2026-09-11).md
docs/feedback-runde-1-abgleich.md|05_Requirements (Team-Input)/Abgleich Alt-Portale gegen neues Portal (Claude, 2026-09-14).md
docs/feedback-runde-2-2026-09-14.md|05_Requirements (Team-Input)/Feedback-Runde 2 — Konrad (2026-09-14).md
docs/speaker-felder-abgleich-2026-09-15.md|05_Requirements (Team-Input)/Speaker-Felder — Paulinas Master-Liste gegen unser Datenmodell (Claude, 2026-09-15).md
docs/speaker-portale-abgleich-2026-09-15.md|05_Requirements (Team-Input)/Speaker-Domaene — die drei Portale gegen Konrads Zielbild (Claude, 2026-09-15).md
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
docs/plan-ergaenzung-2026-09-17.md|08_Projektplan & MVP/Ergaenzender Plan — Abschluss, Abgleich, Feedback-Prozess, Backend, Design (Entwurf, 2026-09-17).md
docs/feedback-leitfaden.md|05_Requirements (Team-Input)/Feedback-Leitfaden — so gibst du Feedback (Claude, laufend).md
docs/chat-startpakete.md|08_Projektplan & MVP/Chat-Startpakete — sechs Sessions, ein Repo (Claude, laufend).md
docs/design-system-v2-auftrag.md|07_Mockups & Design/Design-System v2 — Auftrag an den Design-Chat (Claude, 2026-09-17).md
docs/feld-matrix-2026-09.md|08_Projektplan & MVP/Feld-Eigentuemer-Matrix (generiert, 2026-09).md
MAP
# Runbooks als Ordner
if [ -d docs/runbooks ]; then
  mkdir -p "$DRIVE/08_Projektplan & MVP/Runbooks"
  for f in docs/runbooks/*.md; do cp "$f" "$DRIVE/08_Projektplan & MVP/Runbooks/$(basename "$f")" && echo "✓ $f -> Runbooks/"; done
fi
# Feedback-Backlogs und Abgleich-Matrizen als Ordner
if [ -d docs/feedback ]; then
  mkdir -p "$DRIVE/05_Requirements (Team-Input)/Feedback-Backlog"
  for f in docs/feedback/*.md; do cp "$f" "$DRIVE/05_Requirements (Team-Input)/Feedback-Backlog/$(basename "$f")" && echo "✓ $f -> Feedback-Backlog/"; done
fi
if [ -d docs/abgleich ]; then
  mkdir -p "$DRIVE/05_Requirements (Team-Input)/Abgleich Alt-Neu"
  for f in docs/abgleich/*.md; do cp "$f" "$DRIVE/05_Requirements (Team-Input)/Abgleich Alt-Neu/$(basename "$f")" && echo "✓ $f -> Abgleich Alt-Neu/"; done
fi

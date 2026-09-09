# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices. (Next.js 16: `middleware.ts` ist deprecated → `proxy.ts`; async `params`; React 19; Tailwind v4.)

# Projekt: ChefTreff-Plattform FLS27 (Talentpool + Portale)

Eine Supabase-Datenbank, eine Next.js-App, ein Login (`portal.chef-treff.de`) mit rollenbasierten Bereichen: Talent, Speaker, Speaker-Leads, Partner (+ Messeshop), Volunteers (+ Check-in), Hackathon, Programm-Editor, Produktion, Admin. Go-live 14.10.2026, Prozessstart 01.11.2026, Summit 27 am 16./17.04.2027.

## Quelle der Wahrheit (zuerst lesen)
1. `docs/masterplan.md` — freigegebener Plan (v0.1d): Komponenten, Datenmodell, Rollen, Integrationen, Bau-Wellen.
2. `docs/entscheidungen.md` — Entscheidungslog. **Jede Abweichung vom Masterplan wird hier eingetragen, sonst gilt sie nicht.**
3. `docs/arbeitsauftrag-welle-*.md` — konkreter Arbeitsauftrag der laufenden Welle mit Akzeptanzkriterien.
4. `docs/legacy-inventar.md`, `docs/feedback-fls26.md`, `docs/fragenkatalog-2026-09-07.md` — Herkunft der Anforderungen.
5. `docs/design-briefing.md` — Tokens, Schriften (Sharp Sans SemiBold als Textschnitt, ABC Laica Italic), Events-Theme, **kein Dark Mode**, DE/EN.

## Nicht verhandelbar
- **Sicherheit ist Backbone:** RLS auf jeder Tabelle, Spalten-Grants, `service_role` nur serverseitig nach Rollenprüfung, SECURITY-DEFINER-Funktionen mit gepinntem `search_path`, Webhook-Signaturen + Idempotenz, Audit-Log für Admin-Aktionen. Keine Abkürzungen „für später".
- **Keine Zugangsdaten** in Chat, Repo, Drive oder Screenshots. Werte stehen nur in Vercel-Env (lokal `vercel env pull .env.local`); Platzhalter in `.env.local.example`; Liste in `docs/zugangs-liste.md`.
- **Doku ist Teil der Arbeit:** jede Schema-/Integrationsänderung wird in `docs/` nachgezogen; nach jedem Doku-Commit `sh scripts/mirror-docs.sh` (Drive-Lesekopie). Ziel: Reproduktion aus der Doku jederzeit möglich.
- **Migration der Altdaten ist der letzte Schritt.** Stammdaten ohne Personenbezug (Produktkatalog, Vokabular) dürfen früher importiert werden.
- Datenschutz: Datenminimierung, Consent versioniert, „Profil löschen" + Suppression, keine privaten Kontaktdaten von Team/Freelancern in Portalen.

## Arbeitsweise
- 80-%-Lösung je Bereich → Feedback von Konrad → schärfen. Nichts bauen, was nicht im Masterplan oder Entscheidungslog steht.
- Build-Sessions arbeiten auf Feature-Branches (`welle-N/<thema>`), kleine PRs gegen `main`; Review durch die Architektur-/Security-Session (`/code-review`, `/security-review`) vor dem Merge. `main` deployt automatisch auf Vercel.
- Datenbankänderungen nur als Migration unter `supabase/migrations/` (zusätzlich per Supabase-MCP `apply_migration` auf Projekt `jqmqvgaiyjudkvtncijw` anwenden; Datei danach auf die vom Server vergebene Version umbenennen). Nie direkt im Dashboard „mal eben" ändern. **Jede Migration endet mit `select harden_definer_functions();`** (entzieht anon das EXECUTE auf SECURITY-DEFINER-Funktionen, pinnt search_path).
- Konrad loggt sich für Browser-Walkthroughs selbst ein; Alt-Systeme nur deaktivieren, nie löschen.

## Toolchain auf diesem Mac
- Die Bash-Tool-Shell lädt keine rc-Dateien: Befehle mit `node`, `npm`, `supabase`, `gh`, `vercel` immer mit `source "$HOME/.zshenv" && …` beginnen.
- Dev-Server nur über `.claude/launch.json` (`talentpool-dev`, Port 3000), nie per Bash starten.
- Service-Role-Diagnose: `node --env-file=.env.local scripts/<script>.mjs`. Gültigkeit des lokalen Secret Keys prüfen (ohne ihn auszugeben): `node --env-file=.env.local scripts/check-secret.mjs`. Realtime-Probe (privater Board-Kanal, Wegwerf-Testnutzer): `node --env-file=.env.local scripts/realtime-probe.mjs`.

## Build-Session im Worktree (Checkliste beim Start)
1. Du arbeitest in einem Git-Worktree auf einem Feature-Branch (`welle-N/<thema>`). `main` gehört der Architektur-Session; nie direkt auf `main` committen.
2. Einmalig im Worktree: `source "$HOME/.zshenv" && npm install`. Dann `.env.local` aus dem Haupt-Checkout übernehmen (dort pflegt Konrad sie mit `sh scripts/env-pull.sh --worktrees`, das kopiert sie in alle Worktrees). Achtung: `SUPABASE_SECRET_KEY` ist in Vercel sensibel, `vercel env pull` liefert dafür nur einen Platzhalter; den echten Wert trägt nur Konrad ein. Die Datei ist gitignored und darf nie committet werden.
3. Dev-Server nur über `.claude/launch.json`, Konfiguration **`talentpool-dev-worktree`** (Port 3001), damit der Haupt-Checkout auf 3000 weiterlaufen kann. Magic-Link-Login lokal braucht `http://localhost:3001/auth/callback` in den Supabase-Redirect-URLs (Konrad trägt das ein).
4. Kontext kommt aus dem Repo, nicht aus dem Session-Gedächtnis: `AGENTS.md`, `docs/masterplan.md`, `docs/entscheidungen.md`, `docs/arbeitsauftrag-welle-*.md`.
5. Keine Änderungen an `supabase/migrations/`, `docs/masterplan.md`, `docs/entscheidungen.md`. Offene Fragen und Abweichungswünsche in die PR-Beschreibung.
6. Fertig = `npm run build` und `npm run lint` grün, PR gegen `main` mit kurzer Beschreibung, was getestet wurde. Review und Merge macht die Architektur-Session.

# ChefTreff-Plattform FLS27

Eine Supabase-Datenbank, eine Next.js-App, ein Login (`portal.chef-treff.de`) mit
rollenbasierten Bereichen: Talent, Speaker, Speaker-Leads, Partner (+ Messeshop),
Volunteers, Hackathon, Produktion, Admin.

Go-live 14.10.2026 · Prozessstart 01.11.2026 · Summit 27 am 16./17.04.2027.

**Zuerst lesen:** [`AGENTS.md`](AGENTS.md) (Arbeitsregeln) und
[`docs/masterplan.md`](docs/masterplan.md) (freigegebener Plan).
Abweichungen gelten nur, wenn sie in [`docs/entscheidungen.md`](docs/entscheidungen.md) stehen.

---

## Neu aufsetzen in 10 Schritten

Reproduzierbarkeit ist Teil der Anforderung: Wer diese zehn Schritte ausführt, hat eine
lauffähige Umgebung — ohne Rückfragen und ohne Wissen, das nur in Köpfen steht.

1. **Werkzeuge**: Node 24 (`.nvmrc` des Systems bzw. `nvm use 24`), npm, `git`,
   [Vercel CLI](https://vercel.com/docs/cli), [Supabase CLI](https://supabase.com/docs/guides/cli),
   `gh`. Auf Konrads Mac lädt die Agent-Shell keine rc-Dateien — Befehle mit
   `source "$HOME/.zshenv" && …` beginnen.
2. **Repo klonen**: `git clone git@github.com:<owner>/talentpool.git && cd talentpool`
3. **Abhängigkeiten**: `npm install`
4. **Env-Datei**: `vercel env pull .env.local` (oder `.env.local.example` kopieren und
   die Werte aus der Vercel-Env eintragen). Die Datei ist gitignored und wird **nie**
   committet. Welche Schlüssel es gibt, steht in [`docs/zugangs-liste.md`](docs/zugangs-liste.md).
5. **Datenbank**: Supabase-Projekt `fsjexlrapilzftwibocu` verwenden oder ein eigenes
   anlegen und alle Dateien aus `supabase/migrations/` **in Dateinamen-Reihenfolge**
   anwenden (`supabase db push` bzw. Supabase-MCP `apply_migration`).
6. **Verbindung prüfen**: `node --env-file=.env.local scripts/check-schema.mjs`
   → meldet die Zahl der Vokabular-Einträge.
7. **Auth**: In Supabase → Authentication → URL Configuration die Redirect-URLs
   eintragen: `http://localhost:3000/auth/callback`, bei Worktree-Sessions zusätzlich
   `http://localhost:3001/auth/callback`, dazu die Vercel-Preview- und Produktions-URL.
8. **Dev-Server**: `npm run dev` (Port 3000). In Claude-Sessions **nur** über
   `.claude/launch.json` starten — Konfiguration `talentpool-dev`, im Worktree
   `talentpool-dev-worktree` (Port 3001).
9. **Anmelden**: `http://localhost:3000` → „Anmelden" → Magic-Link. Ohne Mailversand
   hilft `node --env-file=.env.local scripts/dev-login-link.mjs`.
   Team-Rechte: `node --env-file=.env.local scripts/make-staff.mjs <email>`.
10. **Prüfen**: `npm run build` und `npm run lint` laufen fehlerfrei; `/admin/ui` zeigt
    das komplette UI-Kit; `/admin/mail` schickt eine Testmail (ohne `RESEND_API_KEY`
    landet sie im Server-Log).

---

## Aufbau

| Pfad | Inhalt |
|---|---|
| `app/` | Next.js App Router. Bereiche als Route-Gruppen: `(talent) (speaker) (speaker-leads) (partner) (volunteers) (hackathon) (produktion) (admin)` |
| `components/ui/` | UI-Kit (Button, Input, Select, Field, Card, Badge, Table, Drawer, Toast, EmptyState, PageHeader, Stepper) |
| `components/layout/` | Topbar mit Bereichs- und Sprachumschalter, Bereichs-Gerüst |
| `lib/auth.ts` | Rollen-Gate: `getSessionContext` (ein RPC `session_context()` je Request), `requireUser`, `requireRole`, `requireArea`, `requireStaff`, `getMyAreas` |
| `lib/audit.ts` | `logAudit()` für Admin-Aktionen (Urheber aus der Session, Insert per service_role) |
| `lib/areas.ts` | Bereiche ↔ Rollen (von `proxy.ts` und `lib/auth.ts` gemeinsam genutzt) |
| `lib/i18n/` | DE/EN-Dictionaries, `getDictionary`, Locale-Auflösung, Umschalt-Action |
| `lib/mail/` | Resend-Client, `sendTemplate`, Vorlagen, `mail_log`, Suppression-Prüfung |
| `lib/supabase/` | Clients: `client` (Browser), `server` (Session/RLS), `admin` (service_role) |
| `proxy.ts` | Next 16 statt `middleware.ts`: Session-Refresh + Login-Gate, keine Rollenprüfung |
| `supabase/migrations/` | Schema. Einzige erlaubte Art von Datenbankänderung |
| `docs/` | Masterplan, Entscheidungslog, Arbeitsaufträge, Runbooks, generiertes Datenmodell |
| `scripts/` | Diagnose und Generatoren (`node --env-file=.env.local scripts/<datei>.mjs`) |

## Rollen und Bereiche

Ein Login, ein Umschalter. Sichtbar ist nur, wofür eine Rolle in `role_assignment`
vorliegt.

`proxy.ts` ist **reines Login-Gate** — es prüft keine Rollen. Über Bereiche entscheidet
`requireArea()` / `requireRole()` auf Basis der SQL-Funktionen `has_role()` / `is_staff()`,
und zwar in **jeder Seite und jeder Server Action**, nicht nur im Layout: Layouts rendern
bei Client-Navigation nicht neu, ein Layout allein schützt also nichts. Der Aufruf ist pro
Request gecacht. Erst nach bestandener Prüfung darf `createSupabaseAdminClient()`
(`service_role`) entstehen.

Welche Rolle welchen Bereich öffnet, steht in `lib/areas.ts`; die Rollen-Keys selbst sind
im Vokabular `role` kanonisch.

## Sprachen

DE/EN ab Tag 1. Reihenfolge der Auflösung: `person.preferred_language` → Cookie
`ct_locale` → `Accept-Language` → `de`. UI-Texte stehen in `lib/i18n/de.json` und
`lib/i18n/en.json`, fachliche Labels in `vocab_term` (`label_de` / `label_en`) —
nie hartkodiert.

## Mail

`sendTemplate(key, locale, to, vars)` prüft die Suppression-Liste (über die SQL-Funktion
`is_suppressed()`, **fail-closed**: lässt sich die Frage nicht beantworten, geht keine Mail
raus), lädt die Vorlage aus `mail_template`, rendert Markdown → HTML und schreibt jeden
Vorgang nach `mail_log`. Bei einer unterdrückten Adresse steht dort statt der Adresse
`suppressed:<hash>` — gelöschte Adressen tauchen nie wieder im Klartext auf.

Vorlagen werden in `mail_template` gepflegt; `lib/mail/templates.ts` hält nur `test` als
Notnagel für einen frischen Aufsatz. Login-Links verschickt Supabase Auth, nicht das Portal.
Ohne `RESEND_API_KEY` wird lokal (`NODE_ENV=development`) nur ins Server-Log geschrieben —
in jeder anderen Umgebung ist das ein Fehler, kein stiller Erfolg.

## Doku

`docs/schema.md` wird generiert, nicht gepflegt:

```bash
node --env-file=.env.local scripts/gen-schema-doc.mjs
```

Nach jedem Doku-Commit die Drive-Lesekopie aktualisieren:

```bash
sh scripts/mirror-docs.sh
```

Runbooks für Deploy, Rollback, Restore, Key-Rotation und Incident liegen in
[`docs/runbooks/`](docs/runbooks/).

## Sicherheit

RLS auf jeder Tabelle, Spalten-Grants, `service_role` nur serverseitig nach
Rollenprüfung, SECURITY-DEFINER-Funktionen mit gepinntem `search_path`,
Webhook-Signaturen + Idempotenz, Audit-Log für Admin-Aktionen. Keine Zugangsdaten in
Chat, Repo, Drive oder Screenshots. Details: `docs/masterplan.md` §7.

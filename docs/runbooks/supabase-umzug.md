# Runbook · Supabase-Projekt neu aufsetzen / Region wechseln

**Auslöser:** Regionswechsel (z. B. Dublin → Frankfurt), Neuaufbau nach Totalausfall, Reproduktionstest.
**Dauer:** ca. 60 Minuten, davon ca. 10 Minuten Klickarbeit im Dashboard (Konrad).
**Grundsatz:** Das Repo ist die Quelle der Wahrheit. Alles außer Nutzerdaten entsteht aus `supabase/migrations/` und `supabase/seed/`.

## Voraussetzungen
- Supabase-Organisation ChefTreff (Pro-Plan), Zugriff auf das Dashboard.
- Repo auf `main`, `.env.local` im Haupt-Checkout (für Skripte), Supabase-MCP verbunden.
- Liste der Redirect-URLs und Env-Variablen: `docs/zugangs-liste.md`, README Schritt 7.

## Schritte
### A · Neues Projekt (Konrad)
1. Dashboard → Organisation → „New project" → Name `cheftreff-portal`, Region **Central EU (Frankfurt)**, Datenbank-Passwort generieren und im Passwort-Manager ablegen (wird von niemandem sonst gebraucht).
2. Projekt-Ref aus der Dashboard-URL an die Architektur-Session geben.

### B · Schema (Architektur-Session, Supabase-MCP)
3. Alle Dateien aus `supabase/migrations/` **in Dateinamen-Reihenfolge** per `apply_migration` anwenden; Name = Dateiname ohne Version. Dabei prüfen: `list_migrations` zeigt jede Datei genau einmal, Versionen werden anschließend in den Dateinamen übernommen (Konvention seit 08.09.).
4. `get_advisors` (security) → kein `ERROR`; die INFO-Hinweise „RLS enabled, no policy" für service-role-only-Tabellen sind beabsichtigt.
5. Tests aus `supabase/tests/*.sql` laufen lassen (setzt einen eingeloggten Account voraus → erst nach Schritt E möglich, dann nachholen).

### C · Auth (Konrad)
6. Authentication → URL Configuration: Site URL = Produktions-URL; Redirect-URLs: `http://localhost:3000/auth/callback`, `http://localhost:3001/auth/callback`, `<Produktions-URL>/auth/callback`, bei Bedarf Preview-Muster.
7. Authentication → Sign In / Providers → Email: „Prevent use of leaked passwords" an. Später: Google-Provider für Staff (Welle 5).
8. Database → Backups: PITR-Add-on aktivieren (Checkliste).

### D · Verbindungen (Konrad)
9. Supabase → Integrations → Vercel: das Projekt `talentpool` auf das neue Supabase-Projekt umhängen (alte Verknüpfung entfernen). In Vercel prüfen, dass `NEXT_PUBLIC_SUPABASE_URL` auf die neue Ref zeigt, dann „Redeploy".
10. Lokal: `vercel env pull .env.local` im Haupt-Checkout; Datei in den Worktree der Build-Session kopieren. Dev-Server neu starten.

### E · Personen und Rollen
11. Konrad loggt sich einmal auf der neuen Datenbank ein (Magic Link) → `claim_or_create_person()` legt die Person an.
12. Architektur-Session: `role_assignment` (`admin`, global) und `staff_user` für Konrads Person setzen; Testrollen nur bei Bedarf.
13. Demo-Programm: `supabase/seed/demo_programme.sql` ausführen (nur Dev/Test).

### F · Repo und Doku
14. Projekt-Ref ersetzen in `AGENTS.md`, `README.md`, `docs/runbooks/*.md`, `docs/zugangs-liste.md`; Entscheidungslog-Eintrag mit Datum, alter und neuer Ref.
15. `node --env-file=.env.local scripts/check-schema.mjs` und `scripts/gen-schema-doc.mjs`; `sh scripts/mirror-docs.sh`.

### G · Altes Projekt
16. Eine Woche pausieren (Dashboard → Settings → Pause), dann löschen. Vorher: keine Referenzen mehr in Vercel, make.com, Skripten.

## Prüfung
- `list_migrations` vollständig, Advisor ohne ERROR, vier Testdateien ohne `ALLOWED (BUG)`.
- Login lokal (3000 und 3001) und in Production; `/admin` erreichbar; Testmail aus `/admin/mail` landet in `mail_log`.

## Historie
| Datum | Wer | Ergebnis |
|---|---|---|
| 09.09.2026 | Konrad + Architektur-Session | Umzug Dublin (`fsjexlrapilzftwibocu`) → Frankfurt: in Arbeit |

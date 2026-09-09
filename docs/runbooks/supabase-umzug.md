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

**Bootstrap-Admin** (nach dem ersten Login, per Supabase-MCP `execute_sql`; E-Mail anpassen):
```sql
with me as (
  select u.id as auth_user_id, u.email, p.id as person_id
  from auth.users u join public.person p on p.auth_user_id = u.id
  where u.email = 'konrad@chef-treff.de'
),
ins_role as (
  insert into public.role_assignment (person_id, role, scope_type, granted_by, note)
  select person_id, 'admin', 'global', person_id, 'Bootstrap-Admin nach Neuaufbau' from me
  where not exists (select 1 from public.role_assignment r where r.person_id = me.person_id and r.role = 'admin' and r.scope_type = 'global')
  returning id
),
ins_staff as (
  insert into public.staff_user (auth_user_id, email, display_name)
  select auth_user_id, email, 'Konrad Gruner' from me on conflict (auth_user_id) do nothing returning auth_user_id
)
insert into public.audit_log (actor_person_id, actor_auth_uid, action, object_type, object_id, after)
select person_id, auth_user_id, 'bootstrap_admin', 'person', person_id::text,
       jsonb_build_object('role', 'admin', 'scope_type', 'global', 'staff_user', true) from me;
```

### F · Repo und Doku
14. Projekt-Ref ersetzen in `AGENTS.md`, `README.md`, `docs/runbooks/*.md`, `docs/zugangs-liste.md`; Entscheidungslog-Eintrag mit Datum, alter und neuer Ref.
15. `node --env-file=.env.local scripts/check-schema.mjs` und `scripts/gen-schema-doc.mjs`; `sh scripts/mirror-docs.sh`.

### G · Altes Projekt
16. Eine Woche pausieren (Dashboard → Settings → Pause), dann löschen. Vorher: keine Referenzen mehr in Vercel, make.com, Skripten.

## Prüfung
- `list_migrations` vollständig, Advisor ohne ERROR, vier Testdateien ohne `ALLOWED (BUG)`.
- Login lokal (3000 und 3001) und in Production; `/admin` erreichbar; Testmail aus `/admin/mail` landet in `mail_log`.

- Die vier Testdateien nehmen der Testperson **innerhalb der Transaktion** Rollen und Staff-Eintrag weg (Rollback stellt sie wieder her), damit die Negativtests auch mit dem Admin-Konto greifen. Erwartung: keine Zeile `ALLOWED (BUG)`; `04_realtime_send_on_session_insert = 0 msg(s)` ist auf einem frischen Projekt normal (Realtime legt seine Partitionen erst nach dem ersten verbundenen Client an).
- Lokale Entwicklung: `sh scripts/env-pull.sh --worktrees`; `SUPABASE_SECRET_KEY` ist in Vercel sensibel und muss einmal von Hand in `.env.local` eingetragen werden (siehe `docs/zugangs-liste.md`).

## Historie
| Datum | Wer | Ergebnis |
|---|---|---|
| 09.09.2026 | Konrad + Architektur-Session | Umzug Dublin (`fsjexlrapilzftwibocu`, eu-west-1) → Frankfurt (`jqmqvgaiyjudkvtncijw`, eu-central-1, Projekt „FLS27 System & CRM"). Schema aus 17 Repo-Migrationen in 5 Paketen per `execute_sql` eingespielt, Historie mit Repo-Versionen gesetzt; Objektzahlen identisch zum Quellprojekt (je 35 Tabellen, 8 Views, 58 Funktionen, 30 Policies, 31 Trigger, 311 Vokabular-Begriffe); Security-Advisor ohne ERROR. Offen: Auth-URLs, Vercel-Integration, Login, Rollen, Demo-Seed, altes Projekt pausieren. |
| 09.09.2026 (Fortsetzung) | Konrad + Architektur-Session + Build-Session | Auth-Redirects gesetzt, Vercel-Integration verbunden, erste Anmeldung auf Frankfurt 10:38 MESZ erfolgreich. Bootstrap-Admin + Staff für Konrad (Audit-Eintrag `bootstrap_admin`). Vier SQL-Smoke-Tests grün (0 × `ALLOWED (BUG)`; Tests entziehen der Testperson jetzt in der Transaktion ihre Rollen). Demo-Programm vorhanden (13 Slots, 8 Sessions). Befund: `SUPABASE_SECRET_KEY` liegt in Vercel als sensible Variable → `vercel env pull` liefert Platzhalter, Admin-Bereich lokal erst nach manuellem Eintrag (neu: `scripts/env-pull.sh`). Offen: Secret lokal eintragen, Integration-Sync für Preview/Development nachziehen, altes Projekt pausieren. |

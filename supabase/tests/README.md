# SQL-Smoke-Tests (Schema v2)

Ausführung: Inhalt einer Datei per Supabase-MCP `execute_sql` (oder SQL-Editor) laufen lassen. Jede Datei ist eine Transaktion mit `rollback` am Ende und hinterlässt keine Daten. Ergebniszeilen mit `ALLOWED (BUG)` bedeuten: eine Regel greift nicht.

- `v2_roles_programme.sql` — Scopes, Überlappung, Warnungen, Veröffentlichung, Bestätigungspflicht (Migrationen 0006/0007)
- `v2_application_ticket.sql` — Bewerbungs-Pipeline, Maskierung, Ticketpflicht, Kollision, Warteliste, Personalisierung (Migration 0009)

Simulation eines eingeloggten Nutzers innerhalb der Transaktion:
`perform set_config('request.jwt.claims', json_build_object('sub', <auth_uid>, 'role', 'authenticated', 'email', <email>)::text, true);`

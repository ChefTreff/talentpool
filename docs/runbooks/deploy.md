# Runbook · Deploy

**Auslöser:** Ein PR gegen `main` ist reviewt und soll live.

## Voraussetzungen
- `npm run build` und `npm run lint` lokal grün.
- Review durch die Architektur-/Security-Session erfolgt (`/code-review`, `/security-review`).
- Schemaänderungen liegen als Migration unter `supabase/migrations/` vor **und** sind
  per Supabase-MCP `apply_migration` auf Projekt `jqmqvgaiyjudkvtncijw` angewendet.

## Schritte
1. Vercel-Preview des PR öffnen und die geänderten Seiten durchklicken (Login, betroffener Bereich).
2. Supabase-Advisor prüfen: Security und Performance ohne Meldung der Kategorie `error`.
3. PR mergen. `main` deployt automatisch auf Vercel (Production).
4. Deployment in Vercel abwarten, Status „Ready".
5. Doku nachziehen: `node --env-file=.env.local scripts/gen-schema-doc.mjs`, danach
   `sh scripts/mirror-docs.sh` (Drive-Lesekopie).

## Prüfung
- `https://portal.chef-treff.de` lädt, Login per Magic-Link funktioniert.
- Der geänderte Bereich zeigt das erwartete Verhalten; ein Konto **ohne** die Rolle
  sieht ihn nicht.
- Vercel-Runtime-Logs der ersten Minuten ohne neue Fehler.

## Wenn etwas schiefgeht
→ [rollback.md](rollback.md)

## Historie
| Datum | Wer | Ergebnis |
|---|---|---|
| TODO | | |

## Cron (Vercel)
- `vercel.json` → `crons`: `/api/cron/mail` alle 10 Minuten (Bewerbungs-Fristen, Warteliste, Mail-Warteschlange). Vercel ruft die Route mit `Authorization: Bearer <CRON_SECRET>` auf; ohne gesetzte Variable antwortet die Route 401 und tut nichts.
- Prüfen nach dem Deploy: Vercel → Project → Settings → Cron Jobs (Lauf-Historie) oder manuell `curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/mail` → JSON mit `housekeeping` und `queue` (processed/sent/failed/suppressed; `skipped` nennt fehlende Env).
- Offene Aufträge: `select id, template_key, to_email, status, error, queued_at from mail_log where status in ('queued','failed') order by queued_at;` — `failed` nach drei Versuchen; zum erneuten Versuch `status = 'queued'` setzen und `meta - 'attempts'`.

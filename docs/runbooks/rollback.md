# Runbook · Rollback

**Auslöser:** Ein Deployment auf `main` verursacht Fehler in Produktion.

## Entscheidung zuerst
| Lage | Vorgehen |
|---|---|
| Nur App-Code betroffen | Vercel-Rollback (Schritt A) — schnellster Weg |
| Migration hat Daten verändert | **Kein** blindes Rollback. Erst [restore.md](restore.md) lesen |
| Integration schreibt Falschdaten | Betroffenen make.com-Szenario/Webhook deaktivieren, dann A |

## A · Vercel-Rollback
1. Vercel → Projekt → Deployments → letztes funktionierendes Deployment.
2. „Promote to Production".
3. Prüfen: Startseite, Login, betroffener Bereich.
4. `main` im Repo auf denselben Stand bringen (Revert-Commit, **kein** Force-Push).

## B · Migration zurücknehmen
Migrationen sind vorwärtsgerichtet. Rückbau heißt: **neue** Migration schreiben, die
den Zustand wiederherstellt — nie eine bestehende Datei ändern.
1. Wirkung der fehlerhaften Migration bestimmen (`docs/schema.md` vor/nach vergleichen).
2. Umkehr-Migration schreiben, idempotent.
3. Per Supabase-MCP `apply_migration` anwenden, Datei committen.

## Nachbereitung
- Ursache in `docs/entscheidungen.md` bzw. als Issue festhalten.
- Falls Personendaten betroffen: [incident.md](incident.md).

## Historie
| Datum | Wer | Ergebnis |
|---|---|---|
| TODO | | |

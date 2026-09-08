# Runbook · Restore (Backup / PITR)

**Auslöser:** Datenverlust oder fehlerhafte Massenänderung in Supabase.

> **Erst lesen, dann handeln.** Ein Restore überschreibt Daten. Vor jedem Restore
> Zeitpunkt und Umfang schriftlich festhalten (wer, was, ab wann).

## Voraussetzungen
- Zugriff auf das Supabase-Dashboard, Projekt `fsjexlrapilzftwibocu`.
- Point-in-Time-Recovery aktiv (Plan prüfen). Ist PITR nicht aktiv, steht nur das
  letzte tägliche Backup zur Verfügung.

## Schritte
1. **Schreibzugriff stoppen:** make.com-Szenarien deaktivieren, Vercel-Projekt pausieren
   oder Wartungsseite ausliefern.
2. Zeitpunkt bestimmen: letzter bekannt guter Stand (Logs, `audit_log`, `slot_history`).
3. Supabase → Database → Backups → Restore (bzw. PITR auf den Zeitpunkt).
4. Nach dem Restore: `node --env-file=.env.local scripts/check-schema.mjs` und
   `node --env-file=.env.local scripts/gen-schema-doc.mjs`.
5. Migrationshistorie prüfen (`list_migrations`) — fehlen Migrationen, erneut anwenden.
6. Schreibzugriff wieder freigeben, Integrationen einzeln aktivieren.

## Prüfung
- Stichproben: Personenzahl, letzte Registrierungen, `audit_log`-Ende.
- Ein Testlogin und ein Profil-Speichern laufen durch.

## Restore-Test
Einmal je Welle 5 als Übung durchführen (Abschluss-Checkliste) — nicht erst im Ernstfall.

## Historie
| Datum | Wer | Ergebnis |
|---|---|---|
| TODO | | |

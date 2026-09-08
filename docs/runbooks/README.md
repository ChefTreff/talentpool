# Runbooks

Kurze, ausführbare Anleitungen für Situationen, in denen niemand nachdenken will.
Regeln für alle Runbooks:

- **Ein Runbook = ein Ereignis.** Auslöser, Voraussetzungen, Schritte, Prüfung, Nachbereitung.
- **Schritte sind Befehle**, keine Beschreibungen. Wer das Runbook liest, kann es ausführen.
- **Keine Zugangsdaten im Text.** Nur Namen von Env-Variablen und wo sie liegen (`docs/zugangs-liste.md`).
- Nach jeder echten Ausführung: Datum + Ergebnis unter „Historie" eintragen.

| Runbook | Wofür |
|---|---|
| [deploy.md](deploy.md) | Änderung nach Produktion bringen |
| [rollback.md](rollback.md) | Fehlerhaftes Deployment zurücknehmen |
| [restore.md](restore.md) | Datenbank aus Backup/PITR wiederherstellen |
| [key-rotation.md](key-rotation.md) | Schlüssel und Tokens tauschen |
| [incident.md](incident.md) | Störung oder Datenschutzvorfall abarbeiten |

> Status: Skelette aus Welle 0. Jede Welle, die ein Verfahren zum ersten Mal
> anwendet, füllt die zugehörigen Lücken (`TODO`) auf.

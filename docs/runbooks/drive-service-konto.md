# Runbook · Google-Dienstkonto für die Folien-Spiegelung (D13, SPK-023/LEAD-023)

Ziel: Das Portal legt hochgeladene Präsentationen im Technik-Ordner ab (Ordner je Bühne, Unterordner je Tag, Dateiname `Slot-ID_Speaker-Name`) — mit einem Dienstkonto, das **nur diesen Ordner** schreiben darf. Konrad legt das Konto an (Workspace-Admin), der Schlüssel landet nur in Vercel.

## Anlegen (einmalig, ca. 15 Minuten)

1. **Google Cloud Console** (`console.cloud.google.com`) mit dem ChefTreff-Workspace-Konto öffnen. Oben Projekt wählen → „Neues Projekt“ → Name `FLS27 Portal`, Organisation `chef-treff.de`. (Gibt es schon ein Projekt für Portal-Integrationen, dieses nehmen.)
2. **API aktivieren:** Menü „APIs & Dienste“ → „Bibliothek“ → „Google Drive API“ → Aktivieren.
3. **Dienstkonto:** „IAM & Verwaltung“ → „Dienstkonten“ → „Dienstkonto erstellen“ → Name `fls27-portal-drive`, Beschreibung „Folien-Spiegelung Portal → Technik-Ordner“. Bei „Zugriff gewähren“ **keine** Rolle vergeben (das Konto braucht keine Rechte im Cloud-Projekt, nur im Drive-Ordner). Fertigstellen.
4. **Schlüssel:** Dienstkonto öffnen → Reiter „Schlüssel“ → „Schlüssel hinzufügen“ → „Neuen Schlüssel erstellen“ → Typ **JSON** → Erstellen. Die Datei wird einmalig heruntergeladen. **Nicht** in Drive, iCloud oder den Schreibtisch legen, nicht per Mail schicken.
5. **In Vercel eintragen** (Terminal im Repo, Wert wird unsichtbar abgefragt und nur nach Vercel geschrieben):
   ```bash
   sh scripts/env-set.sh GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON --no-local
   ```
   Beim Prompt den **gesamten Inhalt** der JSON-Datei einfügen (eine Zeile ist in Ordnung). Danach die heruntergeladene Datei löschen und den Papierkorb leeren.
6. **Ordner freigeben:** In Drive den Technik-Ordner (ID `1S9d60I8FTA3mtPmYnN1t3Xys_2INQSuE`) öffnen → „Freigeben“ → die Dienstkonto-Adresse eintragen (steht in der Console: `fls27-portal-drive@<projekt-id>.iam.gserviceaccount.com`) → Rolle **„Mitbearbeiter“** → Benachrichtigung aus → Senden. Liegt der Ordner in einer geteilten Ablage, funktioniert die Freigabe des einzelnen Ordners genauso; **nicht** die ganze Ablage freigeben.
7. **Zugangs-Liste** (`docs/zugangs-liste.md`) ergänzen: Variable, Zweck, Anlagedatum, Rotation jährlich. Keine Werte.

## Prüfen

Der Speaker-Chat baut die Spiegelung mit einem Trockenlauf, der zuerst nur die Ordnerliste liest (`drive.files.list` mit `'<ordner-id>' in parents`). Erscheinen die Bühnen-Unterordner, stimmt die Freigabe; ein 404 heißt „Ordner nicht freigegeben“, ein 403 „Drive API nicht aktiviert“.

## Regeln

- Das Konto schreibt nur in diesen Ordner; keine weitere Freigabe, keine Domain-weite Delegation.
- Schlüssel jährlich rotieren (neuen Schlüssel erstellen, in Vercel ersetzen, alten löschen) — Runbook `key-rotation.md` ergänzen.
- Später möglich: Workload Identity Federation über Vercel OIDC statt Schlüsseldatei; für den Start reicht der Schlüssel in Vercel.

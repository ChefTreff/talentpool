# Runbook · Google-Dienstkonto für die Folien-Spiegelung (D13, SPK-023/LEAD-023)

Ziel: Das Portal legt hochgeladene Präsentationen im Technik-Ordner ab — Ordner je Bühne, Unterordner je Tag, Datei „Slot-ID_Speaker-Name“. Dafür nutzt es ein Dienstkonto, das **nur diesen Ordner** bearbeiten darf. Konrad legt das Konto an (Workspace-Admin), der Schlüssel landet nur in Vercel.

**Stand 01.10.2026:** Die Spiegelung ist gebaut (SPK-023), es fehlt nur der Schlüssel (K-03). Ohne Schlüssel bricht nichts: Uploads laufen wie bisher, `/admin/technik` zeigt „Dienstkonto fehlt“.

## Was das Portal macht

- **Wann:**
  - Nach jedem Upload einer Präsentation spiegelt der Server sie nach Drive, im Speaker-Portal, bei den Stage Leads (`/speaker-leads/praesentationen`) und im Admin (`/admin/technik/praesentationen`). Das geschieht erst nach der Rechteprüfung durch `register_speaker_asset` und ohne dass der Upload darauf wartet (`after()`).
  - Entfernt ein Speaker seine Präsentation, ersetzt die vorige Fassung die Datei in Drive. Gibt es keine, geht die Datei in den Papierkorb.
  - `/admin/technik` → Karte **„Folien in Drive“** → **„Spiegelung nachholen“** holt alles Offene nach, höchstens 25 Dateien je Klick. Verschiebungen und verwaiste Kopien sind dabei.
  - Der Cron `/api/cron/mail` (alle 10 Minuten) räumt Kopien ab, deren Folie gelöscht, deren Profil gelöscht (`anonymize_person`) oder deren Session aus dem Slot genommen ist.
- **Wohin:**
  ```
  <Zielordner der Edition>
  └── <Bühne>                       z. B. „Main Stage“
      └── <Datum> · <Tag>           z. B. „2027-04-16 · Tag 1 · Freitag“
          └── <Beginn>_<Speaker>    z. B. „0930_Anna Beispiel.pptx“
  ```
  - Eine lesbare Slot-Nummer wie „SL###“ in Airtable gibt es im neuen Programm nicht. **Die Slot-ID im Dateinamen ist deshalb der Beginn des Slots (HHMM).** Er ist je Bühne und Tag eindeutig und sortiert die Dateien in Programmreihenfolge.
  - Die echte Slot-ID und die Kennung der Präsentation stehen unsichtbar an der Datei (Drive-Eigenschaft `fls27`). So findet der Server sie auch ohne Datenbankzeile wieder.
  - Eine Datei je Speaker und Session. Eine neue Fassung ersetzt den Inhalt **derselben** Datei: Link und Freigabe bleiben gleich, Drive hält die alte Fassung bis zu 30 Tage als Version.
  - Wandert der Slot (andere Zeit, Bühne, anderer Tag), zieht die Datei mit und bekommt ihren neuen Namen. Wird eine Bühne umbenannt, wird ihr Ordner umbenannt.
- **Zielordner:**
  - Er steht je Edition in der Datenbank (`slide_drive_setting`), nicht in Vercel. FLS27 ist auf `1S9d60I8FTA3mtPmYnN1t3Xys_2INQSuE` gesetzt.
  - Der Ordner liegt in der geteilten Ablage, Pfad „Summit 2027 / [DO NOT CHANGE] FLS27 - Automations / [DO NOT CHANGE] FLS27 - Presentations [Automations]“.
  - Ändern lässt er sich unter `/admin/technik` → „Zielordner ändern“ (Abschnitt `tech`, mit Audit).
  - Die ID liegt nicht an `event`, weil `event` für jedes angemeldete Konto lesbar ist. Ist der Ordner per Link geteilt, wäre die ID der Schlüssel zu allen Folien.

## Anlegen (einmalig, ca. 15 Minuten)

1. **Google Cloud Console** (`console.cloud.google.com`) mit dem ChefTreff-Workspace-Konto öffnen. Oben Projekt wählen → „Neues Projekt“ → Name `FLS27 Portal`, Organisation `chef-treff.de`. Gibt es schon ein Projekt für Portal-Integrationen, dieses nehmen.
2. **API aktivieren:** Menü „APIs & Dienste“ → „Bibliothek“ → „Google Drive API“ → Aktivieren.
3. **Dienstkonto:** „IAM & Verwaltung“ → „Dienstkonten“ → „Dienstkonto erstellen“.
   - Name `fls27-portal-drive`, Beschreibung „Folien-Spiegelung Portal → Technik-Ordner“.
   - Bei „Zugriff gewähren“ **keine** Rolle vergeben: Das Konto braucht keine Rechte im Cloud-Projekt, nur im Drive-Ordner. Fertigstellen.
4. **Schlüssel:** Dienstkonto öffnen → Reiter „Schlüssel“ → „Schlüssel hinzufügen“ → „Neuen Schlüssel erstellen“ → Typ **JSON** → Erstellen.
   - Die Datei wird einmalig heruntergeladen.
   - **Nicht** in Drive, iCloud oder auf den Schreibtisch legen, nicht per Mail schicken.
5. **In Vercel eintragen** (Terminal im Haupt-Checkout). Die Schlüsseldatei ist mehrzeilig, `env-set.sh` liest aber genau eine Zeile. Deshalb die Zeilenumbrüche vorher entfernen und den Wert über die Pipe geben; er erscheint dabei nirgends auf dem Bildschirm:
   ```bash
   tr -d '\n' < ~/Downloads/<schluesseldatei>.json | sh scripts/env-set.sh GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON --no-local
   ```
   - Die Umbrüche im privaten Schlüssel stehen in der Datei als `\n`-Text, nicht als echte Zeilenumbrüche, und bleiben erhalten.
   - Danach die heruntergeladene Datei löschen und den Papierkorb leeren.
   - **Wirksam ab dem nächsten Deployment**: nächster Merge auf `main` oder in Vercel „Redeploy“.
6. **Ordner freigeben:** In Drive den Technik-Ordner öffnen (ID `1S9d60I8FTA3mtPmYnN1t3Xys_2INQSuE`) → „Freigeben“ → die Adresse des Dienstkontos eintragen → Benachrichtigung aus → Senden.
   - Die Adresse ist `fls27-portal-drive@<projekt-id>.iam.gserviceaccount.com`. Nach Schritt 5 zeigt `/admin/technik` sie mit Kopierknopf an.
   - Rolle: **„Inhaltsmanager“**, nicht „Mitbearbeiter“. Mit „Mitbearbeiter“ (Contributor) darf das Konto in der geteilten Ablage Dateien anlegen und ersetzen, aber nicht verschieben oder in den Papierkorb legen. Dann könnten Slot-Wechsel, gelöschte Folien und gelöschte Profile nicht nachgezogen werden.
   - **Nicht** die ganze Ablage freigeben, nur diesen Ordner.
7. **Zugangs-Liste** (`docs/zugangs-liste.md`): Die Zeile steht schon. Anlagedatum nachtragen, keine Werte.

## Prüfen

Unter `/admin/technik`, Karte „Folien in Drive“:

1. Das Abzeichen zeigt **„Dienstkonto bereit“**. „Dienstkonto ungültig“ heißt: Die Variable ist gesetzt, aber keine gültige Schlüsseldatei. Häufig fehlt dann eine Zeile, weil die Datei ohne `tr -d '\n'` eingefügt wurde.
2. **„Verbindung prüfen“** meldet sich an und liest den Zielordner, nur lesend. Erwartet:
   - der Ordnername;
   - „geteilte Ablage“;
   - Anlegen, Verschieben und Löschen jeweils „ja“. Steht bei Verschieben oder Löschen „nein“, fehlt die Rolle „Inhaltsmanager“.
3. **„Spiegelung nachholen“** überträgt alles Offene. Mit den Testdaten (`--nur=folien`) erscheint `TEST — Bühne Stage Lead / <Datum> · <Tag> / 1700_TEST Assistenz.pdf`. Danach steht die Zeile in der Karte nicht mehr unter den offenen. Die Zahl „in Drive“ steigt.

**Fehler in der Karte** (je Präsentation unter „Stand“, für den ganzen Lauf unter den Knöpfen):

| Schlüssel | Bedeutung | Abhilfe |
|---|---|---|
| `drive_auth` | Google lehnt die Anmeldung ab | Schlüssel gelöscht oder ersetzt → neuen Schlüssel eintragen (Schritt 4–5) |
| `drive_api_off` | Drive-API im Projekt aus | Schritt 2 |
| `drive_folder_missing` | Ordner nicht gefunden | Ordner dem Konto freigeben (Schritt 6), Zielordner prüfen |
| `drive_quota` | Ordner liegt nicht in einer geteilten Ablage | Ein Dienstkonto hat in „Meine Ablage“ keinen Speicher: Ordner in eine geteilte Ablage legen |
| `drive_permission` | Recht fehlt | Rolle „Inhaltsmanager“ am Ordner (Schritt 6) |
| `drive_rate`, `drive_unavailable`, `drive_network` | Google bremst oder ist nicht erreichbar | später „Spiegelung nachholen“ |
| `storage_missing` | Datei fehlt im Portal-Speicher | Präsentation neu hochladen lassen |

## Regeln

- Das Konto bearbeitet nur diesen Ordner: keine weitere Freigabe, keine domainweite Delegation, keine Rolle im Cloud-Projekt.
- Den Zielordner leer zu speichern beendet die Spiegelung; was schon in Drive liegt, bleibt dort.
- Gelöscht wird über den Papierkorb der Ablage. Endgültig löschen darf in einer geteilten Ablage nur ein Manager der Ablage, und diese Rolle gibt es für einen Ordner nicht. Der Papierkorb löscht nach 30 Tagen von selbst. Wer früher löschen muss (Löschantrag), leert ihn als Manager der Ablage von Hand.
- Schlüssel jährlich rotieren: neuen Schlüssel erstellen, mit Schritt 5 ersetzen, alten in der Console löschen. Runbook `key-rotation.md`.
- Später möglich: Workload Identity Federation über Vercel OIDC statt Schlüsseldatei. Für den Start reicht der Schlüssel in Vercel.

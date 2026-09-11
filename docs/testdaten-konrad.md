# Testdaten für Konrad (Querschnitts-Auftrag F5)

Damit Konrad jedes Portal **von innen** durchklicken kann, bekommt sein eigenes Konto in jedem Bereich einen Datensatz. Alles ist als Test gekennzeichnet und rückstandsfrei löschbar.

## Anlegen und entfernen

```
node --env-file=.env.local scripts/testdaten-konrad.mjs --dry-run   # zeigt nur, was passieren würde
node --env-file=.env.local scripts/testdaten-konrad.mjs --apply
node --env-file=.env.local scripts/testdaten-konrad.mjs --remove
node --env-file=.env.local scripts/testdaten-konrad.mjs --apply --email=jemand@chef-treff.de
```

Das Skript ist wiederholbar: ein zweiter `--apply` legt nichts doppelt an.

## Was angelegt wird

| Bereich | Datensatz | Rolle |
|---|---|---|
| Speaker | `speaker_profile` (keynote, bestätigt, Reception und Lounge, Reisekosten übernommen) | `speaker` |
| Speaker-Leads | — | `speaker_manager` |
| Partner | Organisation `TEST — Partner GmbH` mit `org_edition` (eingeladen, Sponsoring premium), Konrad als **Hauptkontakt**, vier gebuchte Leistungen | `partner_contact` (Scope Org) |
| Volunteers | `volunteer_profile` (angenommen, Shirt L), Testschicht mit Zuteilung | `volunteer` |
| Hackathon | — (Datenmodell kommt mit PR 28) | `hackathon_participant` |
| Produktion | — (Datenmodell kommt mit PR 25) | `production_team` |
| Admin | unverändert (Konrad ist Bootstrap-Admin) | `admin` |

Aus den gebuchten Leistungen entstehen von selbst: **Checklisten-Pflichten**, **Ticket-Kontingente** und die Rolle `standbuehne_editor`, wenn ein Bühnenprodukt dabei ist (Trigger aus 0041/0049/0058). Das ist kein Zufall, sondern der Beweis, dass die Ingest-Automatik greift.

## Kennzeichnung

- Rollen tragen `role_assignment.note = 'testdaten:konrad'` und laufen mit der Edition ab.
- Angelegte Zeilen tragen den Präfix `TEST — ` im Namen, das Volunteer-Profil und das Speaker-Profil `testdaten:konrad` in der internen Notiz, der Vokabular-Eintrag den Schlüssel `zz_test_bereich`.
- `--remove` löscht **genau diese** und sonst nichts: Rollen mit dieser Notiz, die Testorganisation samt allem, was daran hängt, Testschichten und Zuteilungen, das Volunteer- und Speaker-Profil mit dieser Notiz, den Vokabular-Eintrag.

Zwei Dinge bleiben nach `--remove` stehen, bewusst:

- **Konrads Vor- und Nachname**, falls das Skript sie ergänzt hat (sie waren leer). Das ist kein Testdatum.
- Die Rolle `admin`, die es vorher gab.

## Was das Skript nicht tut

Keine erfundenen Personen und keine fremden Mailadressen: alle Kontakte und Speaker sind Konrad selbst. Es verschickt auch keine Mails — `upsert_partner_contact` würde eine Einladung auslösen, deshalb schreibt das Skript die Mitgliedschaft direkt.

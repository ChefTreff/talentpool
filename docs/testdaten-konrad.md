# Testdaten für Konrad (Querschnitts-Auftrag F5)

Damit Konrad jedes Portal **von innen** durchklicken kann, bekommt sein eigenes Konto in jedem Bereich einen Datensatz. Alles ist als Test gekennzeichnet und rückstandsfrei löschbar.

## Anlegen und entfernen

```
node --env-file=.env.local scripts/testdaten-konrad.mjs --dry-run   # zeigt nur, was passieren würde
node --env-file=.env.local scripts/testdaten-konrad.mjs --apply
node --env-file=.env.local scripts/testdaten-konrad.mjs --remove
node --env-file=.env.local scripts/testdaten-konrad.mjs --apply --email=jemand@chef-treff.de
node --env-file=.env.local scripts/testdaten-konrad.mjs --apply --nur=partner   # nur einzelne Schritte, siehe SCHRITTE im Skript
```

Das Skript ist wiederholbar: ein zweiter `--apply` legt nichts doppelt an. `--nur=<schritt>` zieht einzelne Bereiche nach, ohne Profil, Bewerbungen und Rollen der anderen zurückzusetzen (Regel „Konrads Konto sieht alles“, AGENTS.md, 25.09.2026: jeder PR ergänzt seinen Schritt und führt ihn gegen live aus).

## Was angelegt wird

| Bereich | Datensatz | Rolle |
|---|---|---|
| Speaker | `speaker_profile` (keynote, bestätigt, Reception und Lounge, Reisekosten übernommen) | `speaker` |
| Speaker-Leads | — | `speaker_manager` |
| Partner | Organisation `TEST — Partner GmbH` mit `org_edition` (eingeladen, Sponsoring premium), Konrad als **Hauptkontakt**; gebucht sind **alle Format-Produkte** (je eins für `booth`, `stage`, `masterclass`, `company_tour`, `side_event`, `interview_table`, `hackathon`, `branding`, `talk`, Schritt `partner`) und die Ticket-Produkte aus dem ersten Lauf; `TEST — Standbühne` am Summit, `TEST — Talk` (ohne Slot, zum Eintragen von Speakern), `TEST — Masterclass` mit Konrads Bewerbung | `partner_contact`, `standbuehne_editor` (beide Scope Org) |
| Volunteers | `volunteer_profile` (angenommen, Shirt L), Testschicht mit Zuteilung | `volunteer` |
| Hackathon | — (Datenmodell kommt mit PR 28) | `hackathon_participant` |
| Produktion | — (Datenmodell kommt mit PR 25) | `production_team` |
| Admin | unverändert (Konrad ist Bootstrap-Admin) | `admin` |

Aus den gebuchten Leistungen entstehen von selbst: **Checklisten-Pflichten**, **Ticket-Kontingente** und die Rolle `standbuehne_editor`, wenn ein Bühnenprodukt dabei ist (Trigger aus 0041/0049/0058). Das ist kein Zufall, sondern der Beweis, dass die Ingest-Automatik greift.

**Vorsicht bei Produkten mit Pass-Typ:** Ein gebuchtes Produkt mit `pass_type` legt über `sync_ticket_allocations` ein Kontingent ohne `synced_at` an, und der vivenu-Cron macht daraus einen echten Coupon. Der Schritt `partner` bucht deshalb nur Produkte ohne Pass-Typ (die Format-Produkte haben keinen) und bricht für ein Produkt mit Pass-Typ ab. Die Kontingente `partner`/`talent` der Testorganisation zeigen seit dem ersten Lauf auf vivenu-Coupons; `--remove` lässt sie deshalb stehen und meldet sie.

**Was Konrad unter `/partner` sieht** (bei mehreren Organisationen „TEST — Partner“ im Organisations-Wechsler wählen): Übersicht, Wiki · Unternehmen, Kontakte · Checkliste, Dateien, Tickets, Event-App, Messeshop · unter „Eure Formate“ Messestand, Side-Event, Interview Tables, Talk, Hackathon, Branding, Standbühne (Kalender und Tabelle), Bewerber. Masterclass und Company Tour erscheinen mit ihren Seiten (PART-045/046); die Produkte sind schon gebucht.

**Messestand (PART-084):** der Schritt `partner` legt den Test-Stand `ZZTEST-01` (3x3 m, Rückwand 3x2,5 m, beide Tage) über `booth_assignment` an; `/partner/messestand` zeigt damit Maße und Standnummer. `--remove` löscht nur diesen eigenen Stand, einem vom Team zugeordneten nimmt es nur die Zuordnung.

**Öffnungszeiten der Standbühne (PART-090):** der Schritt `partner` trägt für `TEST — Standbühne` Öffnungszeiten ein (`stage_day`): Freitag **12:00–20:00**, Samstag **11:00–19:00** — bewusst anders als der Programmrahmen der Tage (13:00–20:30 und 12:00–19:30), damit sichtbar ist, dass die Zeiten der Bühne gelten. Eine eigene Zeile (`notes = testdaten:konrad`) bekommt die Testzeiten zurück, eine vom Team im Admin gepflegte bleibt. Konrad klickt `/partner/buehne` → Reiter **Tabelle**: oben „Öffnungszeiten eurer Standbühne“ je Tag; einen Slot um 12:00 anlegen oder bis 20:00 verschieben geht, 11:45 oder über 20:00 hinaus meldet „Außerhalb der Öffnungszeiten eurer Standbühne (12:00–20:00)“. Diese Vorabprüfung der Tabelle gilt auch für Konrads Konto; die Sperre in der Datenbank lässt Admin und Programm-Team durch — im Kalender kann Konrad deshalb außerhalb ziehen, ein reiner Partner nicht. Gepflegt werden die Zeiten unter `/admin/edition` (Gerüst, Bühne × Tag). `--remove` nimmt sie mit der Bühne weg (ON DELETE CASCADE).

**Standbühnen-Gäste (PART-081):** `--apply --nur=gaeste` legt eine TEST-Person mit `+zztest-gast-1`-Adresse als Gast der Test-Organisation an (mit Einwilligung, ohne Porträt — die Liste zeigt „Porträt fehlt“) und ordnet sie dem ersten TEST-Programmpunkt der Teststandbühne zu. Braucht die Migration `v6_standbuehnen_gaeste` und den Schritt `partner`. Konrad klickt `/partner/buehne` → Reiter **Gäste** (Liste, Porträt hochladen, bearbeiten, entfernen) und Reiter **Tabelle** → „Details“ am Programmpunkt (Gast zuordnen und abnehmen); im Admin `/admin/partner/<Test-Organisation>` → Karte „Standbühnen-Gäste“. `--remove` entfernt Person, Profil, Zuordnung und hochgeladene Porträts. **Talk (PART-088):** unter `/partner/talk` steht `TEST — Talk` (Schritt `partner`); dort den TEST-Gast unter „Wer spricht“ zuordnen und abnehmen, darunter „Eure Speaker“ — dieselbe Liste wie unter Standbühne → Gäste.

**Partner-Sicht im Board (LEAD-035/036/037/045):** `--apply --nur=standstatus` legt auf `TEST — Standbühne` am Freitag drei TEST-Sessions an, Gastgeberin ist die Test-Organisation: 17:30 „in Bearbeitung“ (Entwurf), 18:00 „zur Freigabe“ (`review`), 18:30 „zurückgegeben“ (Entwurf mit Rückmeldung der Programmleitung in `partner_session_return`, ohne englischen Titel). Die Zeiten liegen frei neben der Test-Masterclass (16–17 Uhr) und in den Öffnungszeiten der Bühne. Braucht den Schritt `partner`; ein zweiter Lauf setzt die Stände zurück. Konrad klickt `/partner/buehne` → Kalender: über dem Kalender die Legende mit den Partner-Ständen, die Karten der eigenen Bühne tragen den Stand in Farbe und Text, fremde Bühnen stehen neutral. Karte öffnen → Schubfach mit Partner-Status; „Veröffentlichen“ (mit Bestätigung) bzw. „Zurücknehmen“; bei „zurückgegeben“ die Rückmeldung und beim Veröffentlichen der Hinweis auf den fehlenden englischen Titel; unter „Speaker“ den TEST-Gast zuordnen und abnehmen, auch vor dem ersten Speichern einer neuen Session. `--remove` nimmt die Sessions (Präfix) und die Bühne samt Slots.

**Öffnungszeiten im Board (LEAD-033):** `--apply --nur=buehne` trägt für `TEST — Bühne Stage Lead` Öffnungszeiten ein (`stage_day`, `notes = testdaten:konrad`): Freitag **14:00–19:00**, Samstag **13:00–18:00** — enger als der Programmrahmen, sonst läge die Schraffur außerhalb des Rasters. Konrad klickt `/speaker-leads/board` oder `/admin/programm`: im Spaltenkopf „Geöffnet 14:00–19:00“, davor und danach schraffiert, in der Legende „Außerhalb der Öffnungszeit“. Als Stage Lead ist die Grenze hart (`outside_stage_day`), im Admin eine Warnung. `--remove` nimmt die Zeiten mit der Bühne weg (ON DELETE CASCADE).

**Mail-Weiche (PART-091):** `--apply --nur=verwaltet` legt einen TEST-Speaker an, den der Partner verwaltet: TEST-Person mit `+zztest-verwaltet`-Adresse, bestätigt; **Konrad ist ihr Kontakt** (Art `partner`, mit Zugang) und steht in `mail_via_contact_id`. Dazu `TEST — Verwaltet-Talk` auf der Stage-Lead-Testbühne (Samstag 15:00–15:30) ohne Bühnenfoto. Braucht `v6_talk_speaker_zugang` und `v6_speaker_mail_weiche` (beide live) sowie den Schritt `buehne`. Konrad klickt `/admin/speaker` → „TEST Verwaltet“: „Mails gehen an Konrad Gruner — der Partner verwaltet alles“, kein Einladen-Knopf. Dann `/admin/grafiken` → `TEST — Verwaltet-Talk` → erstes Bühnenfoto hochladen: „Bühnenfotos bereit“ kommt bei **ihm** an, oben „Diese Mail betrifft TEST Verwaltet.“ (im Mail-Protokoll unter `/admin/mail`). `--remove` entfernt die TEST-Person samt Profil und Kontakt; die Session geht mit dem Präfix.

## Kennzeichnung

- Rollen tragen `role_assignment.note = 'testdaten:konrad'` und laufen mit der Edition ab.
- Angelegte Zeilen tragen den Präfix `TEST — ` im Namen, das Volunteer-Profil und das Speaker-Profil `testdaten:konrad` in der internen Notiz, der Vokabular-Eintrag den Schlüssel `zz_test_bereich`.
- `--remove` löscht **genau diese** und sonst nichts: Rollen mit dieser Notiz, die Testorganisation samt allem, was daran hängt, Testschichten und Zuteilungen, das Volunteer- und Speaker-Profil mit dieser Notiz, den Vokabular-Eintrag.

Zwei Dinge bleiben nach `--remove` stehen, bewusst:

- **Konrads Vor- und Nachname**, falls das Skript sie ergänzt hat (sie waren leer). Das ist kein Testdatum.
- Die Rolle `admin`, die es vorher gab.

## Was das Skript nicht tut

Keine erfundenen Personen und keine fremden Mailadressen: alle Kontakte und Speaker sind Konrad selbst. Es verschickt auch keine Mails — `upsert_partner_contact` würde eine Einladung auslösen, deshalb schreibt das Skript die Mitgliedschaft direkt.

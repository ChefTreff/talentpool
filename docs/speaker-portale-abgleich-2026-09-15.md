# Speaker-Domäne: die drei Portale gegen Konrads Zielbild

**Stand:** 15.09.2026 · Build-Session · Grundlage ist Konrads Nachricht vom 15.09. („Für mich gibt es bei den Speakern: 1. Admin-Sektion … 2. Speaker-Lead Portal … 3. Speaker-Portal").

Das Zielbild in einem Satz je Portal:

1. **Admin** — Zugriff und Verwaltung **aller** Daten: Slots, Speaker, Hospitality, Speaker-Leads als Personen. Nur Konrad, Henni, Paulina.
2. **Speaker-Leads** — eingeschränkter Zugriff für Akquise (CRM), Betreuung (Onboarding) und Programmgestaltung, dazu eine **Regieübersicht**, aus der Techniker und Stage Hands eine Liste drucken.
3. **Speaker** — alles, was der Speaker selbst einträgt.

---

## A · Wo wir stehen

| | Admin | Speaker-Leads | Speaker |
|---|---|---|---|
| Speaker-Liste, Pipeline | **fehlt** | ✓ `/speaker-leads` | — |
| Speaker-Detail, Stammdaten ändern | **fehlt** | ✓ Schubfach, 7 von 20 Feldern | ✓ eigenes Profil |
| Programm: Kalender und Tabelle | ✓ `/admin/programm` | ✓ `/speaker-leads/board` | — |
| Einreichungen prüfen | ✓ `/admin/technik` | ✓ `/speaker-leads/einreichungen` | ✓ Upload |
| Hospitality (Kontingente, Buchungen) | ✓ `/admin/hospitality` | nur lesend im Schubfach | ✓ `/speaker/travel` |
| An- und Abreise | ✓ `/admin/anreise` (neu) | ✓ `/speaker-leads/anreise` (neu) | ✓ (neu) |
| Reisekosten | ✓ `/admin/reisekosten` | — | ✓ `/speaker/reisekosten` |
| Tickets | ✓ `/admin/speaker-tickets` | — | ✓ `/speaker/tickets` |
| **Regie** | — | ✓ `/speaker-leads/regie` (neu) | — |
| **Druck/Export für Technik** | — | ✓ `/regie/druck`, `/regie/csv` (neu) | — |
| Speaker-Leads als Personen verwalten | teilweise `/admin/rollen` | — | — |

## B · Die drei echten Lücken

### 1. Der Admin-Bereich hat keine Speaker-Sektion

Das ist die größte. Wer heute einen Speaker sucht, muss ins **Lead-Portal** — und sieht dort nur, was sein Scope hergibt. Für Konrad, Henni und Paulina ist das genau falsch herum: sie sollen alles sehen, und das Lead-Portal ist der eingeschränkte Blick.

Konkret fehlt `/admin/speaker` mit Liste und Detail. Die Datenwege dafür gibt es schon (`manager_speakers`, `update_speaker`), sie sind für Admin ohnehin offen — es fehlt die Seite.

### 2. Von zwanzig Feldern am Speaker sind sieben pflegbar

`update_speaker` lässt zwanzig Felder zu. Das Schubfach im Lead-Portal zeigt sieben: Typ, Jobtitel, Organisation, Hospitality-Status, Hotelkategorie, Pass-Typ, Lounge.

**Nirgends pflegbar:** die vier Biografiefelder (`bio_short_de/en`, `bio_long_de/en`), `socials`, `tech_rider`, `reception_eligible`, `owner_person_id`, `org_id`, `internal_notes`. Die Biografien und Socials trägt der Speaker selbst ein — das ist richtig so. Aber das Team kann sie nicht korrigieren, und `owner_person_id` (welcher Buddy betreut wen) lässt sich **gar nicht** über die Oberfläche setzen, obwohl der ganze Scope des Lead-Portals daran hängt.

### 3. „Speaker-Leads als Personen verwalten" gibt es nicht als Ort

Heute verteilt sich das auf zwei Stellen: die Rolle `speaker_manager` über `/admin/rollen`, die Zuordnung Speaker → Buddy über `owner_person_id` (siehe oben: nirgends). Konrads Satz beschreibt eine Seite, auf der beides zusammen steht — wer ist Lead, welche Bühne, welche Speaker.

## C · Was jetzt gebaut ist

- **Regie im Lead-Portal** (`/speaker-leads/regie`): dieselbe Tabelle wie in der Produktion, beschränkt auf die Bühnen, für die jemand zuständig ist. Migration 0101 tauscht dafür nur die Rechteprüfung aus — `can_edit_regie()` = Produktion überall, sonst `can_edit_stage()`. Keine neue Regel, sondern die vorhandene.
- **Druckansicht** (`/regie/druck`) außerhalb der Portale, ohne Seitenleiste: was gedruckt wird, soll die Seite sein und nicht der Rahmen darum. Dazu **CSV** (`/regie/csv`). Beides aus der Produktion und aus dem Lead-Portal verlinkt.

## D · Entscheidungen für die Architektur-Session

### D1 · Zugriff auf den Admin-Bereich

**Konrad:** „Zugriff haben nur Konrad (als Super-Admin), Henni als CEO & Programmverantwortlicher und Paulina (Head of Program). Alle anderen bekommen Zugriff über das Speaker-Lead Portal."

Heute öffnet **`is_staff()`** den Admin-Bereich — also jeder Eintrag in `staff_user`. Das ist deutlich weiter als drei Personen.

Drei Wege, in der Reihenfolge, in der ich sie empfehlen würde:

1. **Über die Rolle, nicht über die Namensliste.** Der Admin-Bereich verlangt `has_role('admin')`; `staff_user` bleibt, was es ist — die Kennzeichnung „gehört zum Team" für alles andere (Wiki-Zielgruppen, Produktionslisten). Drei Personen bekommen `admin`, der Rest behält seine Bereichsrollen. Das ist eine Zeile in `canEnterArea` plus eine Bereinigung der vergebenen Rollen.
2. Eine eigene Rolle `admin_full` neben `admin`. Mehr Begriffe für dieselbe Sache.
3. Namen im Code. Nein.

**Nicht zu übersehen:** heute hängen einige Admin-Seiten an `is_staff()`, andere an Bereichsleitungen (`area_lead_partner`, `area_lead_speaker`). Wenn der Bereich zumacht, verlieren die Bereichsleitungen ihre Arbeitsflächen — Partner-Admin, Volunteer-Admin, Hospitality. Das ist kein Argument gegen die Einschränkung, aber es heißt: **die Bereichsleitungen brauchen ihre eigenen Portale, bevor der Admin-Bereich zugeht.** Sonst nimmt man ihnen Werkzeug weg, das es woanders noch nicht gibt.

### D2 · Darf der Partner mit Standbühne die Regie schreiben?

`can_edit_stage()` schließt `standbuehne_editor` ein. Damit darf ein Partner mit gebuchter Standbühne den Ablaufplan **seiner eigenen** Bühne schreiben. Die Architektur-Session nimmt das an (eigene Bühne, Produktion sieht alles). **Frage an Konrad:** gewollt? Wenn nicht, ist es eine Zeile in `can_edit_regie`.

### D3 · Wer trägt `owner_person_id`?

Damit die Zuordnung Speaker → Buddy überhaupt über die Oberfläche geht, braucht es ein Feld — im Admin (alle) und ggf. im Lead-Portal (nur weiterreichen, nicht an sich ziehen). Die RPC kann es schon.

## E · Vorschlag zur Reihenfolge

1. **Admin-Speaker-Sektion** mit Liste, Detail und allen zwanzig Feldern — inklusive `owner_person_id`. Das schließt Lücke 1 und 2 und macht Lücke 3 halb.
2. **Seite „Speaker-Leads"** im Admin: wer ist Lead, welche Bühne, wie viele Speaker.
3. **Danach** der Zugriffsschnitt aus D1 — erst wenn die Bereichsleitungen ihre eigenen Portale haben.

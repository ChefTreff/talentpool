# Zwischenstand der Build-Session „FLS27 · Partner"

Stand 21.09.2026, geschrieben für die Kontextkompression: nach diesem Punkt beginnt die Session mit leerem Gedächtnis und liest nur noch das Repo. Alles, was zum Weiterarbeiten nötig ist und **nicht** ohnehin im Code, in den Migrationen oder in `docs/feedback/partner.md` steht, ist hier festgehalten — vor allem die offenen Auflagen und die Lehren aus den Fehlern dieser Sitzung.

Bereich: `/partner/*` und `/admin/partner/*`. Auftrag: `docs/arbeitsauftrag-welle-6.md` §D/§E. Eigener Plan dazu: `docs/bausteine-partner-2026-09-17.md`. Backlog: `docs/feedback/partner.md` (49 Punkte, davon 30 gebaut, 15 offen, 4 abgelehnt oder zurückgestellt).

---

## 1 · Pull Requests

### Gemergt

| PR | Merge | Baustein | IDs |
| --- | --- | --- | --- |
| [#56](https://github.com/ChefTreff/talentpool/pull/56) | `2437460` | **B1** Seitenleiste in zwei Gruppen, Format-Seiten am gebuchten Produkt | PART-042, PART-002 |
| [#58](https://github.com/ChefTreff/talentpool/pull/58) | `d8ff3d7` | **B3** Frist der Hackathon-Challenge: 18.03.2027 | PART-040, löst PART-032 |
| [#61](https://github.com/ChefTreff/talentpool/pull/61) | `88fd10e` | **B2** Messeshop: zwei Phasen, Zugang nur mit Messestand, Lunch-Paket herausgelöst | PART-037, 038, 049 |

### Offen

| PR | Branch | Baustein | Zustand |
| --- | --- | --- | --- |
| [#68](https://github.com/ChefTreff/talentpool/pull/68) | `partner/a1-formate` | **A1** Formate: Schema, RPCs, Company Tours | **Review beantwortet, sechs Auflagen offen** — siehe §4 |
| [#72](https://github.com/ChefTreff/talentpool/pull/72) | `partner/b5-branding` | **B5** Branding-Seite, gemeinsame Upload-Komponente | Migration ist live, Auflagen erledigt, **wartet auf Gate und Merge** |
| [#74](https://github.com/ChefTreff/talentpool/pull/74) | `partner/b4-hackathon` | **B4** Hackathon-Seite mit Challenge und Rückwand | Auflage erledigt; **hängt auf `partner/b5-branding`** und muss nach dem Merge von #72 auf `main` umgehängt werden |
| [#89](https://github.com/ChefTreff/talentpool/pull/89) | `partner/wiki-inhalte` | Wiki-Inhalte Hackathon (Konrads Auftrag 21.09.) | frisch geöffnet, `main` eingezogen |

**#74 sitzt auf #72.** Das ist die einzige Stapelung im Bereich. Reihenfolge: #72 mergen → #74 auf `main` umhängen → Probelauf der Architektur-Session → #74. Ein Branch wird **nie** gelöscht, bevor der Zustand wirklich `MERGED` ist (Vorfall #60 am 17.09.).

---

## 2 · Migrationen

### Live auf dem Server

| Nr. | Datei | Inhalt |
| --- | --- | --- |
| 0110 | `20260917190103_v6_partner_format_key.sql` | `product.format_key` + Vokabular `partner_format`; Seed teils je Kategorie, teils SKU-genau; `upsert_product` und `partner_overview` erweitert |
| 0111 | `20260917190402_v6_challenge_frist.sql` | Frist `hackathon_challenge` (18.03.2027); Vorlagen von `weeks_before` auf `deadline_key`; `upsert_deliverable_template` prüft die Regel |
| 0112 | `20260917192416_v6_shop_zwei_phasen.sql` | `shop_phase1_end` / `shop_phase2_end`, `org_has_booth()`, `shop_sku_via_deliverable()`, `order_lunch_package()`; Pflicht und Angebot getrennt |
| 0116 | `20260918122700_v6_branding.sql` | Frist und Maße für `digital_branding`; **live, aber die Datei liegt noch in #72** |

### Eingereicht, noch nicht angewendet

| Datei | PR | Bemerkung |
| --- | --- | --- |
| `vorschlag/20260918235901_v6_formate_schema.sql` | #68 | Teil 1 von drei, muss nacheinander angewendet werden |
| `vorschlag/20260918235902_v6_formate_rpcs.sql` | #68 | Teil 2 |
| `vorschlag/20260918235903_v6_company_tours.sql` | #68 | Teil 3 |
| `vorschlag/20260918235905_v6_hackathon_backdrop.sql` | #74 | Auflage eingearbeitet |
| `vorschlag/20260921235901_v6_wiki_hackathon.sql` | #89 | Nummer 0129 von der Architektur-Session; **sie hat dieselbe Nummer auch für die #68-Nacharbeit genannt — vor dem nächsten Vorschlag eine neue erfragen** |

---

## 3 · Bausteine gegen den Plan vom 17.09.

| Baustein | Stand |
| --- | --- |
| B1 Seitenleiste · B2 Shop · B3 Frist | **fertig und gemergt** |
| B5 Branding · B4 Hackathon | gebaut, PR offen |
| A1 Formate (Schema, RPCs, Company Tours) | gebaut, **Nacharbeit offen** |
| B6 Talk · B7 Masterclass/Tour/Side-Event/Interview Tables | **hängen an A1** — zusammen gut die Hälfte des offenen Umfangs |
| B8 Uploads in Checkliste und Dateien spiegeln (PART-035) | nicht begonnen, braucht keine Migration |
| B9 Belege im Dateibereich (PART-036, 007) | wartet auf A5 im Admin-Chat (SevDesk-Abruf) |
| B10 Media Kit (PART-041) | wartet auf A6 im Admin-Chat (Rolle und Grafikbereich) |
| B11 Video-Pop-up und Anleitung (PART-039) | P3, nicht begonnen |

**A1 ist weiterhin der Engpass.** Solange #68 nicht live ist, können B6 und B7 nicht gebaut werden.

---

## 4 · Offene Auflagen zu #68 (wortgetreu aus dem Review)

Die Architektur-Session hat den kombinierten Probelauf gefahren und **sechs** Punkte benannt; die Substanz hat sie freigegeben. Nach dem Push fährt sie den Probelauf erneut und wendet die drei Teile nacheinander an.

1. **Probelauf rot, `v6_formate_schema` Zeile 125.** `update person set auth_user_id = gen_random_uuid()` verletzt `person_auth_user_id_fkey`; `auth_user_id` muss auf `auth.users` zeigen. Für den Login-Trigger `drop_partner_edit_on_login` ein **zweites bestehendes Konto** aus dem Bestand leihen.
2. **`upsert_stage` kennt die neuen Bühnentypen nicht.** Live steht `v_type not in ('main','side','partner_booth','room')` ⇒ 22023. Ohne eine `interview_table`- oder `side_event_venue`-Bühne kann `partner_create_session` nichts anlegen. In Teil 1 von der Live-Fassung aus neu definieren und über `is_vocab_key('stage_type', v_type)` prüfen — dann trägt das Vokabular künftige Typen ohne Migration.
3. **Sicherheitsgrenze `partner_add_speaker`.** Trifft die E-Mail eine **bestehende** Person, bekäme der Partner über `partner_editable_until_login = true` Pflegerechte an fremden Stammdaten, die er nur per E-Mail „geclaimt" hat. Das Recht nur setzen, wenn die Person in dieser RPC **neu** angelegt wurde; sonst `false`, und die Anzeige beschränkt sich auf das selbst Eingegebene.
4. **`partner_update_session` nach der Freigabe.** Titel und Beschreibung sind auch bei `publish_status = 'published'` frei änderbar — das unterläuft D2. Bei Änderungen an `title_*` / `description_*` / `language` zurück auf `review` und Slot auf `requested`, mit Hinweis an den Partner; `format_details` dürfen ohne erneute Freigabe.
5. **`partner_company_tour` gibt `lead_contract_consent_at` heraus** — internes Nachweisfeld, kein Anzeigefeld. Aus der Rückgabe streichen; Name, Rolle, Foto, E-Mail, Telefon bleiben.
6. **`check_format_details`.** `image_asset_id` wird ungeprüft übernommen. Mindestens UUID-Form prüfen, wenn möglich auch die Zugehörigkeit zur Organisation.

**Dazu unabhängig vom Review:** seit 0124 („Stände tagesweise", live am 21.09.) gibt es `booth_assignment`, und `partner_overview` liest daraus statt aus `booth.org_edition_id`. Die #68-Fassung von `partner_overview` stammt von davor. Jede angefasste Funktion wird **aus `supabase/snapshot/functions/<name>.sql` neu aufgesetzt** und bekommt nur die eigene `type = 'partner_booth'`-Einschränkung daraufgelegt.

---

## 5 · Offen bei Konrad

| Was | Wofür |
| --- | --- |
| **Artikelnummer der Interview Tables** | Seed von `format_key` für das neue Format (B7) |
| **Endformat der Hackathon-Rückwand in mm** | Die sieben Grafikanforderungen stehen vollständig im Artikel und in der Pflicht; nur das Endformat fehlt |
| **Katalogpreise**, bevor weitere Shop-Kategorien freigeschaltet werden | PART-010, seine eigene Aufgabe |
| **Freischalten der sechs Wiki-Artikel** aus #89 | Sie stehen bewusst alle als `draft` |
| **Challenge-Beispiele der Vorjahre ins Portal?** | Entscheidung über fremde Geschäftsdaten, keine technische (siehe §6) |

---

## 6 · Wiki-Übertragung vom 21.09. — was nicht übernommen wurde

Konrad wollte „alle Wiki-Daten ins Portal". Vier Dinge aus dem Notion-Wiki „AI Hackathon 2026" sind bewusst **nicht** eingeflossen; die Begründung steht im Kopf der Migration und hier, damit sie nicht verlorengeht. Die Prüfung musste **vor** dem Schreiben passieren: eine Migration bleibt dauerhaft in der Git-Historie, nachträgliches Bereinigen ist keine verfügbare Reihenfolge.

1. **Die Mobilnummer der Ansprechperson.** Ansprechpersonen gehören nach der Regel vom 17.09. in `edition_contact` — mit Foto, dienstlicher Adresse und, bei Externen, dem Einwilligungsdatum aus dem Vertrag. Fest in einen Artikeltext geschrieben umginge sie diese Prüfung und stünde an einer zweiten Stelle, die niemand pflegt.
2. **Die Challenge-Liste 2026** — sieben namentlich genannte Partnerunternehmen.
3. **Die ausformulierten Challenge-Beschreibungen 2025.** Sie beschreiben interne Probleme fremder Firmen. Im internen Notion ist das etwas anderes als in einem Portal, in dem sich alle Partner gegenseitig lesen können, darunter Wettbewerber.
4. **Daten, Ort und Zeitplan 2026.** Der Hackathon 27 läuft am 15./16.04.2027 an einem noch offenen Ort.

---

## 7 · Lehren aus dieser Sitzung

Diese Punkte haben Fehler verursacht oder beinahe verursacht. Sie stehen hier, weil sie sonst nur im Sitzungsgedächtnis liegen.

**`create or replace` geht immer von der Live-Fassung aus.** Vier Funktionen hätte ich auf einen veralteten Stand zurückgesetzt, weil ich die letzte Migration gesucht habe, die eine Funktion *erwähnt*, statt die letzte, die sie *definiert*. Bei `upsert_product` und `partner_overview` wären `pass_type` und `grants_role` verlorengegangen, und `partner_overview` hätte Spalten gelesen, die es seit 0117 nicht mehr gibt. Seit 18.09. ist `supabase/snapshot/functions/<name>.sql` die Quelle — immer der Serverstand. `docs/db-konventionen.md` §1.

**`resync_deliverables` läuft nicht in einer Migration.** Sie prüft `is_partner_team()`, und eine Migration hat keinen Sitzungskontext — weder über `scripts/db.sh` noch über MCP. Stattdessen `sync_deliverables(oe.id)` je `org_edition` der laufenden Editionen; das prüft keine Rechte und tut dasselbe.

**Ein Test kann grün sein und nichts belegen.** Zweimal passiert: `kb_articles('partner', v_ed)` hätte die Edition als Sprache übergeben, und ohne die Zielgruppe `partner` hätte „unsichtbar" genauso ausgesehen wie „kein Zugriff" — null Treffer in beiden Fällen. Deshalb steht in `v6_wiki_hackathon.sql` vor dem Sichtbarkeitsschritt eine ausdrückliche Vorbedingung. Aus demselben Grund prüfen die PII-Schritte auf **Muster** und nicht auf die eine bekannte Nummer: ein Test, der nur das Bekannte sucht, findet beim nächsten Import nichts.

**Zwei Befunde, die eine Zeile Code weit auseinanderlagen.**
`order_lunch_package` hätte den ganzen Warenkorb bestätigt — eine fremde Entwurfszeile wäre ungefragt verbindlich geworden. Heute bestätigt sie nur, wenn außer dem Lunch-Paket nichts im Korb liegt, sonst `confirmed = false`.
`mark_overdue_deliverables` hat Angebote gemahnt. Beim Beheben kam dazu: `send_partner_reminders` formuliert „überfällig seit" **anhand des Datums**, nicht des Status — die Statusänderung allein hätte nicht gereicht.

**Vokabular an mehr als einer Stelle.** `tour_lead` brauchte drei Einträge: Vokabular, CHECK und die Whitelist in `upsert_edition_contact`. Ohne die dritte hätte die Datenbank den Typ erlaubt und die Pflege ihn mit 22023 abgewiesen. Vor jedem neuen Schlüssel den bestehenden Schlüssel durch `supabase/` grepen.

**Kleinigkeiten, die Zeit gekostet haben.** `slot.status` kennt `requested` und `final`, kein `bestaetigt`. `edition_contact` hat `role_label_de` / `role_label_en`, kein `role_label`. `DeadlineCard` nimmt `dateText`, `days`, `hours`, `soon` — kein `locale`. `declare` gehört in den Kopf eines plpgsql-Blocks, nicht dazwischen. Wörterbücher (`lib/i18n/*.json`) werden **auf Schlüsselebene** gemergt, als Dreiweg über die drei Index-Stufen, nie textuell.

---

## 8 · Ein Fund außerhalb des eigenen Bausteins

**`docs/datenmodell-v2.md`, Zeile 34 (Welle-6-Zelle), enthält den Block zu 0110 dreimal**, 0111 zweimal. Das steht so auf `main` und stammt nicht aus meinen Commits — mehrere Chats hängen an dieselbe Tabellenzelle an, und die Dreiweg-Merges haben dabei Text verdoppelt statt zusammengeführt. Die Zelle ist inzwischen ein einzelner Absatz von mehreren tausend Zeichen. Das schadet niemandem beim Bauen, aber die Datei ist die Grundlage dafür, das Schema aus der Doku zu reproduzieren; drei Kopien derselben Beschreibung lassen bald offen, welche gilt. Ich fasse sie bewusst **nicht** in diesem PR an — dafür braucht es einen Zeitpunkt, an dem keine Welle-6-Chats gleichzeitig darauf schreiben. Vorschlag: eine Zeile je Migration statt eine Zelle je Welle.

---

## 9 · Nächster Schritt

Sobald die Architektur-Session #72 gemergt hat: #74 auf `main` umhängen. Sobald sie eine freie Vorschlagsnummer genannt hat: die sechs Auflagen zu #68 einarbeiten, `partner_overview` aus dem Snapshot nach 0124 neu aufsetzen, Probelauf-Bitte. Danach ist mit A1 der Weg frei für **B6** und **B7** — die größte offene Hälfte des Bereichs.

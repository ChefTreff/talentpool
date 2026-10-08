# Befund PART-116: SevDesk-Angebot aus dem Warenkorb (08.10.2026)

**Frage (Plan, Entscheidung PART-116):** Geben Plan und API von SevDesk Angebote her, damit „Angebot erstellen“ im Messeshop-Warenkorb ein SevDesk-Angebot (Order, `orderType` AN) samt PDF erzeugt, mit Referenz am Warenkorb? Sonst internes PDF.

**Vorgehen:** ausschließlich lesende Aufrufe (`GET`) mit dem vorhandenen serverseitigen Token (`SEVDESK_API_TOKEN`, nirgends ausgegeben), ausgewertet nach Struktur und Zählern — keine Kundennamen, Adressen oder Beträge hier. **Nichts angelegt, geändert oder gelöscht.** Eine Einschränkung steht unter „Was ich nicht geprüft habe“.

## Ergebnis in einem Satz
**Ja, der SevDesk-Weg ist machbar** — das Konto führt bereits 21 Angebote, die API liefert sie samt PDF, und `Order/Factory/saveOrder` ist die Schwester des schon genutzten `saveInvoice`. **Offen** sind drei Entscheidungen (Festschreiben, Texte, Nummernkreis) und ein Probelauf mit Schreibzugriff, den nur Konrad freigeben kann.

## Was die API hergibt (gemessen)
| Frage | Befund |
|---|---|
| Zugang | Token gültig, `GET /SevUser` 200 (vier Nutzer). |
| Systemversion | `Tools/bookkeepingSystemVersion` = **2.0** → Steuer über `taxRule` (nicht `taxType`); alle 21 Angebote tragen `taxRule` 1, `taxType` leer. |
| Angebote im Konto | `Order` mit `orderType=AN`: **21**, Nummernmuster `AN-####`, jüngstes vom 28.08.2026; zusätzlich mindestens eine Auftragsbestätigung (AB), keine Lieferscheine. Nächste freie Nummer laut `getNextOrderNumber` (ohne Verbrauch): `AN-1232`. |
| Status | 4 × 200 (versendet), 2 × 300 (abgelehnt), 2 × 500 (angenommen), 13 × 1000 (in Rechnung umgewandelt). Bedeutung nach API-Dokumentation: 100 Entwurf · 200 versendet · 300 abgelehnt · 500 angenommen · 750 teilweise berechnet · 1000 berechnet. |
| Aufbau eines Angebots | Alle in EUR, `showNet` 19/21, alle mit Kopfzeile, Kopftext und Fußtext; **keine** Zahlungs-/Lieferbedingungen, **keine** interne Notiz; Ansprechpartner (SevUser) gesetzt; `version` 0, `addressCountry` = StaticCountry 1. Positionen (`OrderPos`) tragen `part` (Artikelstamm), Einheit 1 (Stück), Steuersatz 7. |
| PDF | `GET /Order/{id}/getPdf` → 200, JSON mit `content` (Base64, rund 158 KB), `filename`, `mimetype` = `application/pdf`. |
| Anlegen (Dokumentation, nicht ausprobiert) | `POST /Order/Factory/saveOrder`, Body `{ order, orderPosSave, orderPosDelete }`; Pflicht im `order`: `orderNumber`, `orderDate`, `contact`, `status`, `addressCountry`, `contactPerson`, `taxRate`, `taxRule`, `taxText`, `currency`, `header`, `version`, `mapAll` (`taxType` nur für Altbestand); Pflicht je Position: `unity`, `taxRate`, `quantity` (dazu `price` und `name` oder `part`). Antwort: `order` und `orderPos`. |
| Weitere Endpunkte | `PUT /Order/{id}/sendBy` (`sendType` VPR/VP/VM/VPDF, `sendDraft`), `getPdf` mit `download` und `preventSendBy`. |

## Wichtig: `getPdf` schreibt fest
Laut API-Dokumentation **„holt das PDF und schreibt den Beleg fest“** (`commits the order`). Das ist ein `GET` mit Nebenwirkung. Für den Bau heißt das: ein Angebot im Status 100 wird mit dem ersten PDF-Abruf verbindlich; `preventSendBy=true` verhindert nur den Versand. **Ich habe `getPdf` einmal an einem bereits versendeten Angebot (Status 200) gelesen**, um zu prüfen, dass das PDF kommt. Danach habe ich Status und Änderungszeitpunkt aller 21 Angebote verglichen: **keines wurde verändert** (Verteilung unverändert, keine Änderung in den letzten 24 Stunden). Entwürfe habe ich nicht angefasst.

## Was ich nicht geprüft habe
- **Schreiben:** ob `saveOrder` auf diesem Konto/Tarif funktioniert. Das Paket lässt sich über die API nicht abfragen; Lesen aller Order-Endpunkte klappt, und das Konto legt über die API bereits Rechnungsentwürfe an (`saveInvoice`, Runbook `sevdesk-shop-rechnungen.md`), was für dieselbe Paketstufe spricht, aber kein Nachweis ist.
- **Festschreibe-Verhalten** eines frisch angelegten Entwurfs (Statuswechsel durch `getPdf`).
- **Auslandspartner/EU:** andere `taxRule` (Reverse Charge) — alle bestehenden Angebote nutzen `taxRule` 1.

## Vorschlag für den Bau (Datenmodell vorab an Plan)
**Ablauf** (Server-Route unter dem Partner-Portal, nur serverseitig, Token nie im Browser):
1. Rollenprüfung: eingeloggte Person gehört zur Organisation des Warenkorbs (gleiche Prüfung wie `shop_my_orders`); kein Zugriff auf fremde Warenkörbe.
2. Warenkorb und Rechnungsadresse über eine Lesefunktion `shop_quote_basis(order_id)` (neu, Definer, Org-Mitglied oder Partner-Team) — dieselben Felder wie `shop_invoice_candidates`: Positionen (SKU, Name, Einheit, Menge, Nettopreis, USt-Satz), Firmierung/Adresse/Zusatz, USt-ID, Rechnungs-E-Mail, PO-Nummer.
3. Kontakt: `organization.sevdesk_contact_id`, sonst `createContact` + Adresse + E-Mail (wie beim Rechnungslauf).
4. `saveOrder` mit `orderType` AN, Status 100, `taxRule` 1, Positionen mit `part` (Artikelstamm aus `lib/sevdesk/parts.ts`, sonst `name`), Einheit 1, Kopf/Fuß aus Vorlagentexten, Gültigkeit im Fußtext.
5. PDF über `getPdf` (festschreibend, siehe oben) **ohne Ablage bei uns** durchreichen; Referenz speichern.
6. Referenz: `external_ref` hat `unique (system, object_type, object_id)` und `shop_order` ist für die **Rechnung** schon belegt (`record_shop_invoice`) → eigener `object_type` **`shop_quote`**, `external_id` = SevDesk-Order-ID, `meta` = Angebotsnummer, Summe, Positions-Hash. Eine Zeile je Warenkorb; ändert sich der Warenkorb (Hash), entsteht eine neue Angebotsfassung, das alte bleibt in SevDesk.
7. Schreibweg `record_shop_quote` (Definer, Rechteprüfung wie Schritt 1, Audit **ohne Klartext-Adresse**, nur Org-ID und Angebotsnummer).

## Entscheidungen, die vor dem Bau fehlen
1. **Festschreiben:** Soll jedes „Angebot erstellen“ sofort ein verbindliches SevDesk-Angebot (mit Nummer aus dem Kreis `AN-####`) sein? Vorschlag: ja, aber **ein Angebot je Warenkorb-Stand** und eine Wartezeit zwischen zwei Erzeugungen, damit Partner den Nummernkreis nicht verbrauchen. Alternativ erst Entwurf (100) und das Team versendet — dann ist es kein Self-Service mehr und hilft für eine PO nicht.
2. **Texte:** Kopf-, Fußtext und Angebotsgültigkeit (heutige Angebote haben alle welche) — Konrad/Vertrieb liefern, Vorschlag aus einem Bestandsangebot.
3. **Kontaktanlage für Partner ohne SevDesk-Kontakt** ist ein Schreibzugriff auf ein Fremdsystem. Nach der Regel „vor dem Anlegen in SevDesk wird gesprochen“ braucht es Konrads Ja.
4. **Probelauf mit Schreibzugriff:** ein Test-Kontakt (ZZTEST) und ein Test-Angebot in SevDesk, danach löschen/archivieren. Entwürfe sind löschbar, ein festgeschriebenes Angebot nicht ohne Stornierung — deshalb nur den Entwurf anlegen und nicht `getPdf` rufen, bis Entscheidung 1 steht.
5. **EU-/Auslandspartner:** `taxRule` je Land entscheiden oder diese Partner auf „Angebot beim Team anfragen“ lenken.

## Rückfall, falls Konrad kein Festschreiben will
Internes PDF aus unseren Daten (kein Nummernkreis, kein Buchhaltungsdokument). Für eine PO beim Kunden ist das schwächer; die Referenz am Warenkorb entfällt dann, die Positionen stehen im PDF.

## Sicherheit und Datenschutz
Token und `service_role` nur serverseitig nach Rollenprüfung; kein SevDesk-Aufruf aus dem Browser; keine Adressen im Audit; das PDF wird nicht gespeichert; jede Route prüft die Organisation aus der Sitzung, nie aus dem Request.

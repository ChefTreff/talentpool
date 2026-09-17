# Umsetzungsplan Partner — Antwort der Build-Session auf den Arbeitsauftrag Welle 6 (17.09.2026)

> **Zur Freigabe durch Konrad. Es wird nichts gebaut, bevor er zugestimmt hat.**
> Der Auftrag ist `docs/arbeitsauftrag-welle-6.md` (Architektur-Session); dieses Blatt wiederholt ihn nicht, sondern sagt, **in welcher Reihenfolge die Partner-Bausteine entstehen, was je Baustein noch fehlt und welche drei Stellen des Auftrags eine Entscheidung brauchen**, bevor P1 baubar ist.
> Abgeglichen gegen alle 21 offenen Punkte in `docs/feedback/partner.md` (Status `erfasst`: P1 fünf, P2 fünfzehn, P3 einer) und die Walkthrough-Antworten in `docs/abgleich/messeshop.md`, `partner-hub-rest.md`, `initiativen.md`.

---

## 1 · Reihenfolge (folgt Auftrag §E, ein PR je Baustein)

| PR | Baustein | IDs | Prio | Migration | Wartet auf |
|---|---|---|---|---|---|
| 1 | **B1** Seitenleiste: „Euer Summit" und „Eure Formate", Seiten nur bei gebuchtem Produkt | PART-042 | P1 | klein (siehe Befund 2) | Frage 1 · Befund 2 |
| 2 | **B2** Shop nur mit Messestand, zwei Bestellphasen | PART-037, 038 | P1 | ja (A4.2) | Frage 2 · Befund 1 |
| 3 | **B3** Challenge-Frist vier Wochen | PART-040, 032 | P1 | ja | Frage 3 |
| 4 | **B4** Hackathon-Sektion mit eigenem Backdrop | PART-033 (HACK-005) | P2 | ja | D4 des Auftrags (Maße) · PR 1 und 3 |
| 5 | **B5** Branding | PART-043 | P2 | ja (A2) | PR 1 |
| 6 | **B8** Uploads gespiegelt in Checkliste und Dateien | PART-035 | P2 | nein | PR 1 |
| 7 | **B6** Talk: Slot gespiegelt, Speaker eintragen | PART-044 | P2 | A1 | **A1-Schema** · LEAD-010, ADM-025 |
| 8 | **B7** Masterclass, Company Tour, Side-Event, Interview Tables | PART-045–048, 034 | P2 | A1 | **A1-Schema** · D1, D2, D3 · ADM-026 · SKUs für die zwei neuen Formate |
| 9 | **B9** Belege im Dateibereich | PART-036, 007 | P2 | nein | A5 (Admin-Chat: SevDesk-Abruf) |
| 10 | **B10** Media Kit | PART-041 | P2 | nein | A6 (Admin-Chat: Rolle und Grafikbereich) |
| 11 | **B11** Video-Pop-up und „Anleitung & Support" | PART-039 | P3 | nein | — |

**A1 ist der Engpass.** PR 7 und 8 sind zusammen gut die Hälfte des offenen Umfangs und hängen am Formate-Datenmodell. Nach Auftrag §E schreibe ich diese Migration selbst und schicke der Architektur-Session **zuerst den Tabellen-Entwurf** (Spalten, Vokabular, `format_details`-Schlüssel je Format), bevor ich die RPCs baue. Das ist der nächste Schritt nach PR 1 bis 3.

**Ohne eigenen Baustein:** PART-001 (Leitsatz „wie ein Kunde, der draufschaut") ist Maßstab jeder Seite und wird in jedem PR mitgeprüft, nicht separat gebaut. PART-010 (Katalogpreise vor dem Freischalten einer Kategorie) ist Konrads Aufgabe.

---

## 2 · Drei Befunde am Auftrag (Rückfragen an die Architektur-Session)

**Befund 1 · `available_phase2` gibt es schon, es heißt `late_orderable`.**
A4.2 verlangt eine neue Spalte `product.available_phase2` („kurzfristig bestellbar"). Das Feld existiert seit Migration 0038 als `product.late_orderable`, ist im Produkte-Reiter des Partner-Admins pflegbar, wird in `shop_catalogue` und in jeder Schreib-RPC des Shops ausgewertet und trägt heute genau diese Bedeutung. Eine zweite Spalte daneben wäre die Art von Doppelung, die der Backend-Walkthrough gerade aufspüren soll. **Vorschlag:** `late_orderable` behalten und in Kommentar und Doku auf die neue Zwei-Phasen-Welt umschreiben; wenn der Name stören soll, in derselben Migration umbenennen statt verdoppeln.

**Befund 2 · B1 ist P1, `product.format_key` steckt in A1.**
B1 soll sofort kommen, braucht aber die Zuordnung „welches gebuchte Produkt öffnet welche Seite". Der Auftrag legt sie als `product.format_key` an — in A1, also eine Stufe später. **Vorschlag:** `format_key` als kleine eigene Migration aus A1 herausziehen und mit B1 ausliefern (Spalte plus Seed je SKU). Dann entsteht die Zuordnung einmal als Daten; sonst steht sie zuerst als SKU-Liste im Code und wird bei A1 ein zweites Mal gebaut.

**Befund 3 · PART-002 hat keinen Baustein.**
Event-App, „Team-Mitglieder hinzufügen" (P2, Status `erfasst`) kommt in B1 bis B11 nicht vor. Befund aus dem Code: die Funktion gibt es, sie heißt nur anders — die Kontaktrolle „Event-App-Mitglied" unter `/partner/kontakte`, und jeder so angelegte Kontakt landet im Swapcard-Ausstellerlauf. Was fehlt, ist der Bezug auf der Event-App-Seite selbst. Das wäre ein halber Tag. **Frage:** eigener kleiner Baustein, an B1 angehängt, oder bewusst zurückgestellt?

---

## 3 · Fragen an Konrad (vor P1 zu beantworten)

Die Architektur-Session hat dir schon D1 bis D6 gestellt (Kapazität Interview-Slot, Freigabe-Gate, Export-Umfang, Backdrop-Maße, Company-Tour-Zeiten, Award). Diese drei kommen dazu und blockieren die drei P1-Bausteine:

**Frage 1 — Welches Produkt öffnet welche Seite (B1, PART-042)?**
Mein Vorschlag aus der Item-Liste 2026; bitte bestätigen oder korrigieren:

| Seite | Öffnet bei |
|---|---|
| Messestand | Kategorie `standflaeche` oder ein vom Team zugewiesener Stand (wie heute) |
| Talk | Main Stage Speaking (I-87007), Topic Stage Speaking (I-21110), Skill & Mindset Stage Panel (I-15248) |
| Masterclass | Masterclass (I-33783) |
| Company Tour | Kategorie `company_tours` (I-85973, I-33092) |
| Hackathon | Kategorie `hackathon` (I-10729, I-23208) und das Challenge-Produkt I-37220 |
| Branding | Kategorie `branding` |
| Standbühne | Standbühne (I-79895), wie heute |
| Side-Event | **Produkt fehlt im Katalog** — 2027 neu |
| Interview Table | **Produkt fehlt im Katalog** — 2027 neu |

Für die zwei neuen Formate brauche ich die Artikelnummern, sobald sie im Angebot stehen. Ohne sie kann der Partner die Seiten nicht sehen, egal was gebaut ist.

**Frage 2 — Was zählt als „gebuchter Messestand" (B2, PART-037)?**
Der Shop soll nur mit Messestand sichtbar sein. Mein Kriterium wäre eine gebuchte Standfläche (die vier All-Inclusive-Pakete, Start-Up 1,5 qm, Eigenproduktion) oder ein vom Team zugewiesener Stand. Zählen der **Hackathon-Stand** (I-10729) und die **Standbühne** (I-79895) auch dazu? Und soll ein Partner ohne Stand trotzdem das **Lunch-Paket** bestellen dürfen, oder ist der Shop für ihn ganz zu?

**Frage 3 — Welches Datum ist „vier Wochen vor dem Event" (B3, PART-040)?**
Vier Wochen vor dem **Hackathon** (15.04.2027) wäre der **18.03.2027**, vier Wochen vor dem **Summit** (16.04.2027) der 19.03.2027. Die Challenge betrifft den Hackathon, deshalb wäre mein Vorschlag der 18.03.2027 — bitte kurz bestätigen.

---

## 4 · Stand der Arbeitsumgebung

- Worktree auf Branch `partner/start`, `origin/main` eingemergt (Stand 37ba90d), `npm install` gelaufen.
- `npm run lint` und `npm run build` auf diesem Stand grün — die Ausgangsbasis ist sauber.
- `.env.local` liegt im Worktree (von der Architektur-Session kopiert).
- Dev-Server: `talentpool-dev-worktree` auf Port 3001; der Magic-Link-Redirect für 3001 steht laut Startpaket schon in Supabase.

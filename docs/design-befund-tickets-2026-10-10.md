# Design-Befund · Ticket-Bestätigung und Admin-Tickets (TAL-019) · 10.10.2026

UX-Abnahme nach dem Muster ADM-109, **nur Befund** (Plan, 10.10.: kein Bau — der Talent-Chat baut Teil 3 in denselben Dateien). Go-live ist der 14.10.; `/tickets/bestaetigung` sehen **Ticketkäufer**, `/admin/bewerbungen/tickets` das Team. Die Prioritäten richten sich danach: **P1** erzeugt falsche Daten oder eine Sackgasse für echte Käufer (vor Go-live), **P2** verbessert die Bedienung (bei mehreren Tickets spürbar), **P3** ist Politur.

**Wie geprüft:** lokale Vorschauseiten (nicht eingecheckt) mit der echten `BestaetigungView` (Kopie mit Attrappe der Server-Aktion), der echten Hülle (`AppHeader`, `PortalFooter`, `SidebarShell`) und dem Markup der Admin-Seite, Musterdaten. 1440/1024 und 375 px (grober Zeiger). Zustände: Gate, leer, wartend, ein Ticket, drei Tickets (offen · teilweise · vollständig), alle fertig, Speichern, Überspringen, Fehler. Quelltext gelesen: `app/tickets/bestaetigung/*`, `lib/vivenu/bestaetigung.ts`, `supabase/snapshot/functions/personalize_ticket.sql`, `my_tickets.sql`, `my_transaction_tickets.sql`, `app/(talent)/tickets/page.tsx`, `app/(admin)/admin/bewerbungen/tickets/page.tsx`.

## Kurzfassung

Gerüst und Zustände stimmen: Gate mit einer Aktion auf einem Bildschirm, neutrale Leere (kein Hinweis, ob es die Bestellung gibt), Zustand als Wort im `Badge`, Pflichtfelder gekennzeichnet, `autocomplete` je nach „für mich“, `role="status"` und `role="alert"`, 44-px-Ziele, **kein seitliches Scrollen bei 375 px** (Gate, Leere, drei Karten), kein Barcode und kein Secret auf der Seite. **Drei Befunde sind Fehlerquellen für echte Käufer (B1 bis B3)**, fünf verbessern die Bedienung bei mehreren Tickets (B4 bis B8), der Rest ist Politur.

| Nr | P | Wo | Befund |
|---|---|---|---|
| B1 | **1** | Karte nach „Vorerst überspringen“ | zeigt den **vorbelegten Namen des Käufers wie gespeichert**, obwohl nichts gespeichert wurde |
| B2 | **1** | alle Karten | **jedes Ticket startet „für mich“** mit dem Profil des Käufers; beim Abwählen bleiben die Felder gefüllt |
| B3 | **1** | Text beim Überspringen, `/tickets` | „jederzeit unter ‚Tickets‘ ergänzen“ — **es gibt dort keinen Weg** |
| B4 | 2 | Seite bei mehreren Tickets | alle Formulare gleichzeitig offen: 2623 px, dreimal „Speichern“ |
| B5 | 2 | Karte „Und jetzt?“ | primäres „Profil vervollständigen“ neben dem primären „Speichern“ |
| B6 | 2 | Leere und Gate | **keine Aktion bei falscher Adresse**; der Anmelden-Link der Kopfzeile verliert die Bestellung |
| B7 | 2 | nach „Speichern“ | der Fokus geht verloren |
| B8 | 2 | Fehlertexte | `ticket_not_valid`/`ticket_not_found` raten zum Neuversuch; der genaue Namenstext erscheint nie |
| B9 | 3 | Einleitung | „Ticket(s)“ |
| B10 | 3 | Verlassen mit ausgefüllten Feldern | keine Rückfrage |
| B11 | 2 | Admin, Spalte „Pass“ (und CSV) | zeigt den technischen Schlüssel („student“) statt der Bezeichnung |
| B12 | 3 | Admin, Texte und Tabellen | Frage als Überschrift, „Σ“, „Rückschreiben“, doppelter Leersatz, keine `mailto:`, 375 px |

## Befunde

**B1 · Übersprungenes Ticket sieht gespeichert aus (P1).** `BestaetigungView.tsx:111` baut die Zusammenfassung aus den **Formularwerten**, nicht aus dem Gespeicherten. Gemessen (375 px, drei offene Tickets, Karte 3 → „Vorerst überspringen“): Badge „Angaben fehlen“, Text **„Mara Beispiel · Beispiel GmbH“**, Knopf „Ändern“ (Karte 192 px); aufgerufen wurde die Speicherung nicht. Folge: der Käufer liest seinen Namen, hält das Ticket für erledigt und geht; beim Check-in fehlt der Name, im Admin steht das Ticket in „Noch nicht personalisiert“. **Vorschlag:** die Zusammenfassung nur, wenn gespeichert wurde (Zustand ≠ `pending`), sonst `skippedText`; der Knopf heißt „Ausfüllen“, solange nichts gespeichert ist (heute überall „Ändern“).

**B2 · Jedes Ticket startet „für mich“ (P1).** `BestaetigungView.tsx:68`: `useState(bekannt ? k.for_me : true)` — bei neuen Tickets immer „für mich“, die Felder aus dem Profil des Käufers. Gemessen bei drei offenen Tickets: **drei Mal angehakt, drei Mal „Mara“ vorbelegt, drei Mal „Speichern“**. `personalize_ticket` setzt bei „für mich“ `person_id` auf den Käufer und prüft nicht, dass es höchstens ein Ticket je Bestellung ist; das Rückschreiben nach vivenu (hinter `VIVENU_WRITE_ENABLED`) trüge denselben Namen auf alle drei Badges. Wer ein Ticket abwählt, behält **alle vier Felder** (gemessen: Vorname, Nachname, Firma, Position unverändert, die Karte wächst von 608 auf 756 px, das Pflichtfeld E-Mail erscheint leer unten): wer nur die E-Mail ergänzt, speichert „Mara Beispiel, Head of People“ für eine andere Person, Stand „Vollständig“. **Vorschlag:** nur das **erste** noch offene Ticket „für mich“ vorbelegen, die weiteren „für eine andere Person“, Felder leer, E-Mail zuerst; beim Umschalten die Felder leeren, solange sie noch die Profilwerte tragen, und beim Zurückschalten wieder vorbelegen. Eine Datenbankprüfung „höchstens ein Ticket je Bestellung für mich“ wäre eine Frage an Plan.

**B3 · Versprechen ohne Weg (P1).** `skippedText`: „Noch offen — du kannst es jederzeit unter „Tickets“ ergänzen.“ `/tickets` (`app/(talent)/tickets/page.tsx`) kennt keine Personalisierung: kein Stand, kein Link; `my_tickets()` liefert weder `personalization_status` noch die Transaktions-Id, und keine Datei außer der Seite selbst verlinkt `/tickets/bestaetigung`. Zurück führt nur die Weiterleitung von vivenu mit `?transactionId=` (und die Erinnerungsmail aus Teil 3, falls sie den Link trägt). **Vorschlag:** auf `/tickets` je Ticket mit Stand ≠ vollständig die Zeile „Angaben fehlen — jetzt ergänzen“ mit Link auf `/tickets/bestaetigung?transactionId=…` (dafür muss `my_tickets()` die Transaktions-Id und den Stand mitgeben — Plan/Talent); **bis dahin den Satz ändern**, etwa „Der Link in deiner Bestätigungs-E-Mail führt dich jederzeit hierher zurück.“, sobald Teil 3 die Mail verschickt.

**B4 · Alle Formulare offen (P2).** `offen = zustand !== "complete"`: bei drei offenen Tickets stehen drei vollständige Formulare untereinander — **608 px je Karte, Seite 2623 px bei 375 px**, drei gleichwertige primäre „Speichern“ (Regel 1), „Und jetzt?“ erst bei y 2177. **Vorschlag:** das erste offene Ticket aufgeklappt, die übrigen als Zeile (Titel, Badge, „Ausfüllen“); nach dem Speichern das nächste öffnen und den Fokus dorthin setzen; über der Liste eine Zeile „0 von 3 Tickets vollständig“ (Kit `Fortschritt`). Ein Ticket (der häufigste Fall) bleibt wie heute.

**B5 · Zwei primäre Aktionen (P2).** „Und jetzt?“ (`:54`) steht auch bei offenen Formularen und trägt ein primäres „Profil vervollständigen“ plus „Programm ansehen“ und „Zu meinen Tickets“ (3 Knöpfe, am Handy untereinander, 290 px). Am Desktop mit einem Ticket (1440 × 900) stehen „Speichern“ (y 515) und „Profil vervollständigen“ (y 701) **beide primär im ersten Bild**. **Vorschlag:** die Karte erst zeigen, wenn alle Tickets vollständig sind („Alles eingetragen“); davor nur „Zu meinen Tickets“ als `ghost`.

**B6 · Sackgasse bei falscher Adresse (P2).** Der häufigste Fehlerfall — angemeldet mit der Firmenadresse, gekauft mit der privaten — endet im leeren Zustand („Bleibt sie leer, melde dich mit der E-Mail-Adresse an, mit der du gekauft hast“) mit **„Neu laden“ und „Zu meinen Tickets“**, aber ohne Weg zur anderen Adresse. Im Gate führt außerdem der **Anmelden-Link der Kopfzeile** (`AppHeader`) ohne `next` auf `/login`: wer ihn statt des Knopfes in der Karte nimmt, landet nach der Anmeldung nicht bei der Bestellung (zwei „Anmelden“ auf einem Bildschirm). **Vorschlag:** im leeren Zustand „Mit anderer Adresse anmelden“ (abmelden, dann `/login?next=…`); im Gate die Kopfzeile ohne zweiten Anmelden-Link oder mit demselben `next`.

**B7 · Fokus geht verloren (P2).** Nach „Speichern“ setzt `setOffen(false)` (`:97`) das Formular samt fokussiertem Knopf außer Kraft: Tastatur- und Vorlesenutzer stehen wieder am Seitenanfang. **Vorschlag:** den Fokus auf die Statuszeile der Karte oder deren Überschrift setzen (`role="status"` steht schon da); fällt mit B4 zusammen (nächstes Ticket öffnen).

**B8 · Fehlertexte (P2).** Geprüft mit der Attrappe: `ticket_not_valid` und `ticket_not_found` zeigen „**Etwas ist schiefgelaufen. Bitte erneut versuchen.**“ — bei einem stornierten Ticket hilft kein Neuversuch (kein Text in `rpc` oder `ticketBestaetigung`); `not_allowed` zeigt „Dafür fehlt dir die Berechtigung.“ ohne Weg. `name_required` zeigt „Bitte einen Namen angeben.“ statt des genaueren „Bitte Vor- und Nachname angeben.“: `rpcMessages[r.key] ?? t[r.key]` (`:92`) sucht zuerst im allgemeinen Wörterbuch, der Satz der Seite wird nie gezeigt. **Vorschlag:** Reihenfolge tauschen (`t[r.key]` zuerst); zwei Texte ergänzen, DE und EN: „Dieses Ticket ist nicht mehr gültig. Schreib uns an {Postfach}.“

**B9 · „Ticket(s)“ (P3).** `lead` (`:45`): „Zu dieser Bestellung gehören 1 Ticket(s).“ — Ein-/Mehrzahl je Sprache (ein Satz für 1, einer für n).

**B10 · Verlassen ohne Rückfrage (P3).** Wer Felder ausfüllt und „Zu meinen Tickets“ wählt, verliert sie still. Bei einem Ticket vertretbar; mit B4 (Karten bleiben länger offen) lohnt `useUngesichert`.

**B11 · Admin: „Pass“ als Schlüssel (P2).** `page.tsx` Zeile 136 zeigt `z.pass_type` — „student“, „talent“, „startup“ —, die Teilnehmerseite die Bezeichnung (`vlabel(vocab, "ticket_type", …)` → „Student Pass“); die CSV (`lib/tickets/nicht-personalisiert.ts`, Spalte „Pass“) trägt ebenfalls den Schlüssel. Zum Nachfassen braucht das Team die Bezeichnung.

**B12 · Admin: Texte und Tabellen (P3).** (a) Die Überschrift ist eine Frage — „Tickets: wer ist noch nicht personalisiert?“ (bei 375 px zwei Zeilen) — neben dem Reiter „Tickets“; kurz „Tickets“, die Frage gehört in die Beschreibung. (b) „Σ“ in der Summenzeile → „Gesamt“. (c) „Rückschreiben“ und „Rückschreiben offen“ sind Entwicklersprache → „Übertragung zu vivenu“ und „Übertragung offen“. (d) Der Block „Stand je Veranstaltung“ zeigt ohne Daten „Noch keine Tickets“ mit dem Satz „Es gibt keine gültigen Tickets, bei denen Angaben fehlen“ — derselbe Satz wie im zweiten Block, passt hier nicht. (e) Die Käufer-Adresse ist kein `mailto:`-Link, obwohl die Liste „zum Nachfassen“ da ist. (f) Bei 375 px laufen beide Tabellen seitlich (644 px in 341) und „Stand“ liegt außerhalb; Admin ist Desktop-Arbeit (1440: kein Überlauf, Zeilen 44 px, lange Adressen brechen per `break-all`) — nur nebenbei.

## Reihenfolge, wenn gebaut wird

1. **B1, B2, B8** — reine Änderungen in `BestaetigungView.tsx` (und zwei Wörterbuchzeilen), klein, mit Test (ausführbare Regel „welches Ticket startet für mich“, „Zusammenfassung nur gespeichert“). Vor Go-live.
2. **B3** — Text sofort, der Weg über `/tickets` braucht `my_tickets()` mit Transaktions-Id und Stand (Datenbank, Plan) und gehört in Teil 3 (Erinnerungsmail trägt denselben Link).
3. **B4 bis B7** — ein UI-PR (Karten zuklappen, Fortschritt, „Und jetzt?“, Fokus, Leere mit anderer Adresse), danach die Sichtprüfung bei 375 px.
4. **B9, B10, B11, B12** — nebenbei im selben oder einem Admin-PR.

## Nicht geprüft

Echte Daten und vivenu-Rückgaben, EN-Texte, Safari, Vorlesesoftware, die Mail aus Teil 3, das Verhalten der Seite `/login` mit `next`, die Seite mit echtem Login (Konrads Klick auf die drei TEST-Tickets der Transaktion `zztest-tx-bestaetigung`).

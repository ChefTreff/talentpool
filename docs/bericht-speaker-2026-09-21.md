# Zwischenstand Speaker-Domäne — 21.09.2026

Geschrieben vom Chat „FLS27 · Speaker-Domäne" (Zuständigkeit: `/speaker/*`, `/speaker-leads/*`, `/admin/speaker*`, `/admin/programm`, `/admin/hospitality`, `/admin/anreise`, `/admin/reisekosten`, `/admin/technik`, `/regie/*`).

Anlass: der Chat wird komprimiert, damit das Kontextfenster klein bleibt. Was ein nachfolgender Chat wissen muss, steht deshalb hier und nicht mehr nur im Gesprächsverlauf. Die verbindlichen Quellen bleiben `docs/feedback/speaker.md`, `docs/feedback/speaker-leads.md` und das Entscheidungslog; dieser Bericht fasst zusammen und begründet.

---

## 1 · Was live ist

Alles aus der Feedback-Runde vom 17.09. ist gebaut und auf `main`, bis auf zwei Punkte (Abschnitt 2).

| Backlog | PR | Migration (Server-Nr.) | Was es tut |
| --- | --- | --- | --- |
| SPK-002, 004, 011, 015, 017 | [#55](https://github.com/ChefTreff/talentpool/pull/55) | — | Hallenplan im Speaker-Portal, Profilfoto-Upload, „Summit Slides" (früher Slid@Home), Ansprechperson statt Rollenpostfach, Einwilligung als Pop-up nach dem Klick auf „Buchen" |
| SPK-016, SPK-018 (Datenmodell) | [#71](https://github.com/ChefTreff/talentpool/pull/71) | 0117 `v6_session_tech`, 0119 `v6_shuttle` | Technik-Ansage am Slot und Shuttle-Buchungen als Tabelle mit Freigabe |
| SPK-018, PROD-007 | [#79](https://github.com/ChefTreff/talentpool/pull/79) | 0121 `v6_regie_tech` | Technik unter dem Slot, die Ansage erscheint als Spalte in der Regie |
| SPK-016, LEAD-011, ADM-028 | [#81](https://github.com/ChefTreff/talentpool/pull/81) | — (nutzt 0119) | Shuttle-Formular im Portal, Bereich für die Speaker-Leads, Freigabe und Export (CSV **und** .xlsx) im Speaker-Admin |
| SPK-003 | [#84](https://github.com/ChefTreff/talentpool/pull/84) | 0125 `v6_reception` | Speaker Reception als eigenes Objekt: Datum, Ort, Obergrenze, Zu- und Absage mit Begleitung, Verwaltung im Speaker-Admin |
| SPK-013 | [#85](https://github.com/ChefTreff/talentpool/pull/85) | — | „Hear me speak"-Grafik im Portal statt beim Fremddienst |
| SPK-012 | [#86](https://github.com/ChefTreff/talentpool/pull/86) | 0126 | Titel-Assistent: im Gespräch zu Titel und Beschreibung |
| SPK-005 | [#87](https://github.com/ChefTreff/talentpool/pull/87) | 0127 `v6_speaker_kontakt` | Agentur oder Office am Profil, ohne Portalzugang, mit Einwilligung |

**Noch nicht mit Konrads Login durchgeklickt.** Die Oberflächen sind gebaut, gelintet und getestet, aber ein Walkthrough im Browser steht für alles ab #79 aus. Für den Reisekosten- und Hospitality-Weg braucht Konrad dafür sein eigenes Konto; das Einwilligungs-Pop-up (SPK-017) zeigt sich nur, wenn er seine Hospitality-Einwilligung vorher wieder abwählt.

---

## 2 · Was offen ist

| Backlog | Prio | Stand |
| --- | --- | --- |
| **SPK-014** Kalendereinträge (ICS) für Slot, Briefing, Soundcheck | P2 | in Arbeit. Slot-Daten liegen vor (`my_sessions`), **Briefing und Soundcheck haben kein Datenobjekt** (siehe SPK-022), und der Mail-Worker kennt keine Anhänge (`docs/mail-plan.md`, Abschnitt „Offen") |
| **SPK-019** Media Kit und Bühnenfotos | P2 | in Arbeit. Das Backend ist live: `session_asset` mit `kind = 'stage_photo'`, `register_session_asset` benachrichtigt beim ersten Foto je Session (`stage_photos_ready`), `my_session_photos()` liest sie speakerseitig, hochgeladen wird unter `/admin/grafiken`. Es fehlt allein die Seite im Speaker-Portal |
| **SPK-021** mehrere Assistenzen mit eigenem Login | P2 | neu am 21.09. von Konrad, noch nicht angefangen. Datenmodell-Frage, siehe unten |
| **SPK-022** Briefing und Soundcheck als Termin | P2 | neu, Fund aus SPK-014 |
| **LEAD-010** Partner-Organisation am Slot | P2 | erfasst, noch nicht angefangen; greift in das Partner-Portal hinein (`/partner/talk`), also mit dem Partner-Chat abzustimmen |
| LEAD-009, SPK-001, 008, 009, 010, LEAD-008 | P3 | zurückgestellt bzw. Aufgabe Konrad |

**SPK-021 ist keine Kleinigkeit.** Heute hängt genau eine Assistenz als `speaker_profile.assistant_person_id` am Profil, und dieses eine Feld steckt in einer ganzen Reihe von Rechteprüfungen (`my_speaker_profile`, `update_my_speaker_profile`, `my_sessions`, Shuttle, Hospitality). Mehrere Assistenzen heißt: eine Zuordnungstabelle statt einer Spalte, und jede dieser Prüfungen muss mit. Das ist eine Migration mit Breitenwirkung und gehört vor dem Bauen in den Plan-Chat — nicht, weil es schwierig wäre, sondern weil ein übersehener Leser stillschweigend zu wenig oder zu viel zeigt.

---

## 3 · Entscheidungen dieses Bereichs, die nicht im Code stehen

Sie stehen im Entscheidungslog und in den PR-Beschreibungen; hier zusammengezogen, weil sie sonst über acht PRs verteilt sind.

**Das Porträt für die „Hear me speak"-Grafik verlässt den Browser nicht** (#85). Es wird nicht hochgeladen, nicht gespeichert, nicht an einen Dienst geschickt. Ein Bild, das nirgends ankommt, muss auch niemand löschen. Die Maske arbeitet deshalb mit einem PNG-Template, aus dem die Ellipse herausgestanzt ist, statt mit Ellipsen-Mathematik — der Rahmen liegt über dem Porträt und trifft die Form auf den Pixel genau.

**Der Kontakt ohne Portalzugang braucht eine Einwilligung, aber keinen Sperrlisten-Eintrag** (#87). Wer eine Agentur einträgt, gibt fremde Kontaktdaten weiter; deshalb ist das Einwilligungsdatum Pflicht, sobald ein Feld gefüllt ist. Beim Löschen leert `anonymize_person` die Felder mit, legt aber keinen Hash in `suppression` an: die Adresse stand nie in einem Verteiler, und `queue_mail` braucht eine `person_id`, die dieser Kontakt nicht hat. Einen Hash von jemandem aufzubewahren, der nie etwas von uns wollte, wäre das Gegenteil von Datenminimierung. Konrad hat beides am 21.09. bestätigt.

**Der Einwilligungsnachweis liegt am Profil, nicht in `consent_record`** (#87). Dort stehen Einwilligungen, die eine Person für sich selbst gibt, versioniert je Text. Hier bestätigt die Speakerin etwas über eine dritte Person, die keinem Text zugestimmt hat — eine Selbstauskunft, kein Consent im Sinne der Tabelle. Sie steht als Datum am Profil, wie `edition_contact.contract_consent_at` (0114), und das Setzen liegt mit Akteur im Audit-Log. Auch das hat Konrad am 21.09. bestätigt.

**Die Obergrenze der Reception zählt Plätze, nicht Zusagen** (#84), und die eigene bisherige Zusage zählt beim Ändern nicht mit — sonst ließe sich eine Begleitung nie nachtragen, wenn es eng wird. Eine Absage bleibt als Zeile stehen, damit das Team „abgesagt" von „nie geantwortet" unterscheiden kann.

**Fünf Fahrten je Speaker, dann „Weitere Fahrt beantragen"** (#81, Konrad 17.09.). Jede Fahrt aus dem Speaker- und dem Leads-Portal wird einmal vom Speaker-Admin freigegeben. Der Export läuft als CSV **und** als .xlsx über eine gemeinsame Spaltenliste, damit beide Formate nicht auseinanderlaufen.

**Technik ist Freitext** (#79, Konrad 17.09.: „ich denke Freitext bietet mehr Flexibilität"), keine festen Auswahlwerte. `session.tech` ist die Ansage des Speakers, `regie_cue` die Disposition der Regie — die beiden werden nicht vermischt.

---

## 4 · Was dieser Bereich sich abgewöhnt hat

Fünf Dinge, die hier schiefgegangen sind und die ein nachfolgender Chat nicht wiederholen muss.

**Dreiwertige Logik in Rechteprüfungen.** In `can_request_shuttle` stand `v_person = v_me or v_assistant = v_me or can_manage_speaker(...)`. Ohne Assistenz ist der mittlere Term NULL, das ganze `or` wird NULL, `if not NULL` greift nie — Fremde hätten Fahrten anfordern und stornieren können. Jede solche Kette braucht `coalesce(..., false)`, innen wie an der Aufrufstelle. NULL ist in einer Rechteprüfung nicht „nein".

**Bestehende Funktionen nur aus dem Snapshot ändern.** `supabase/snapshot/functions/<name>.sql` ist die Live-Fassung. Wer eine Funktion aus dem Gedächtnis oder aus einer alten Migration neu schreibt, entfernt stillschweigend, was andere Chats seither eingebaut haben. Der Diff je Funktion gehört in die PR-Beschreibung, dann sieht der Review sofort, ob nur das Gewollte dazukam.

**Fehlerschlüssel nicht wiederverwenden, nur weil der Text passt.** `contact_consent_required` bedeutet seit 0114 „fremde Mail-Domain braucht ein Vertragsdatum". Für die Einwilligung eines Dritten wurde `speaker_contact_consent_required` angelegt. Ein gemeinsamer Schlüssel hieße eine gemeinsame Meldung, und die passte dann auf keinen der beiden Fälle. Neue Schlüssel gehören in `lib/rpc-error.ts` **und** in beide Wörterbücher; die Schlüsselmengen von DE und EN müssen gleich bleiben.

**Erst ausrechnen, was nach dem Schreiben dastünde, dann prüfen.** Wer die Bedingung gegen die eingehenden Felder prüft statt gegen den Zustand danach, lässt eine reine Namenskorrektur an einer Einwilligung scheitern, die längst vorliegt. Das war die Lehre aus 0114 und steht jetzt als eigener Testschritt in `v6_speaker_kontakt.sql`.

**Testerwartungen sind auch nur Annahmen.** Zweimal war nicht der Code falsch, sondern der Test: eine Stornierung reichte nach sechs offenen Fahrten noch nicht unter die Grenze, und ein `updated_at`-Vergleich ist sinnlos, solange die Spalte `not null default now()` hat und `now()` in der Transaktion stillsteht. Ein Test, der aus dem falschen Grund grün oder rot ist, ist schlimmer als keiner.

---

## 5 · Was bei anderen liegt

**Konrad**
- Englische Rollenbezeichnungen für die vier Ansprechpersonen (`role_label_en` fehlt im Admin-Formular — an den Admin-Chat gegeben, siehe SPK-015).
- Der Hallenplan ist 8503 × 6062 Pixel bei 2,9 MB (51 Megapixel). Das Bild braucht im Browser spürbar Zeit; eine verkleinerte Fassung wäre besser.
- Die Rotation des Supabase-Secret-Keys ist weiter offen (Entscheidungslog 21.09.).

**Admin-Chat**
- **ADM-027**: LinkedIn-Post-Vorlagen pflegen. Die Bühnenfotos selbst sind fertig (Upload unter `/admin/grafiken`, Benachrichtigung beim ersten Foto); für SPK-019 entstehen die Vorlagen deshalb zunächst als feste Texte im Portal, die Pflegeoberfläche bleibt ADM-027.

**Plan-/Architektur-Chat**
- Datenmodell für mehrere Assistenzen (SPK-021).
- Datenmodell für Speaker-Termine jenseits des Slots (SPK-022) — ohne das bleibt SPK-014 auf den Slot beschränkt.
- Anhänge im Mail-Worker; erst damit lassen sich ICS-Einladungen verschicken statt herunterladen (`docs/mail-plan.md`, „Offen"; hängt an B8).

**Auf der Abschluss-Checkliste**
- „Speaker Reception" ist ein Arbeitstitel. Der endgültige Name muss überall ersetzt werden; der Punkt steht in `docs/abschluss-checkliste.md`.

---

## 6 · Nächste Schritte in diesem Bereich

1. **SPK-019** Seite `/speaker/media`: Bühnenfotos nach dem Slot, LinkedIn-Vorlagen, Verweis auf die Grafik. Ohne Migration, das Backend steht.
2. **SPK-014** ICS für den Slot und die Reception als Download im Portal; Versand erst, wenn der Worker Anhänge kann.
3. Danach Konrads Feedback-Runde zu allem Gebauten, und **LEAD-010** in Abstimmung mit dem Partner-Chat.

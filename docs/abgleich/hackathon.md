# Abgleich Hackathon — Altsystem → neues Portal

**Stand: 2026-09-17 · Entwurf der Architektur-Session (Codebefund, nicht am Gerenderten geprüft) · zur Prüfung durch Konrad im Walkthrough**

**Quellen (alt):** Luma-Event `luma.com/cheftreff-ai-hackathon` (Inventar §3: 09.–10.04.2026, Factory Hammerbrooklyn, kostenlos mit Auswahl, 350 Plätze / 357 „Went“, 18–35 Jahre, „9 challenges, 6 teams per challenge, 3–5 people per team“) · Airtable `appVO7yVsIZzdd2Bm` (Applications 512, Participants 310, 2025 288/223, 2024 204, Professoren 99, Hack26 Feedback & Warteliste 27 = 29; **alle sieben Tabellen unverlinkt**) · Discord als Kommunikationskanal · SoftR Partner Hub, Seite „Hackathon“ (Inventar §2.4: Challenge-Formular, Preise, Speed-Dating, Backdrop, Team-Formular; Sichtbarkeit über Product Type = Hackathon) · Airtable Partner `Customer-Data` mit 10 Feldern „Hack – …“ (Inventar §2.1) · Notion „AI Hackathon 2026: Wiki“ inkl. „Zeitlicher Ablauf für Teilnehmende“ (Inventar §14).
**Quellen (neu):** `/hackathon`, `/hackathon/challenges`, `/hackathon/teams`, `/hackathon/schedule`, `/hackathon/judging`, `/admin/bewerbungen`, Partner-Checkliste `/partner/checkliste`; Migration 0085 (`20260914095624_v4_hackathon.sql`) und 0089 (`20260914104906_v4_hackathon_sprache.sql`); Arbeitsauftrag Welle 4 Abschnitt D (E3, E4, E5).

**Methode.** Zeile = eine Seite, Tabelle oder Funktion des Altsystems; daneben steht, wo das im neuen Portal liegt, in welchem Zustand, und woran man das im Code sieht. Geprüft wurde ausschließlich am Quelltext und an den Migrationen — nicht am Gerenderten und nicht mit echten Daten.

**Regel: Die Matrix benennt Lücken, sie schließt keine.** Gebaut wird nur, was Konrad je Zeile als „FLS27 braucht es“ markiert; alles andere wird als „bewusst weggelassen“ ins Entscheidungslog geschrieben.

---

## 1 · Luma-Event (Anmeldung, Auswahl, Kommunikation)

| Alte Seite / Funktion | Neu (Pfad) | Status | Beleg | Prüfung Konrad | Prio |
|---|---|---|---|---|---|
| Öffentliche Eventseite mit Beschreibung, Ort, Datum, Anmeldeknopf | — | **fehlt** — der Hackathon hat keine öffentliche Seite im Portal; `/hackathon` liegt hinter Login **und** Rolle | `requireArea("hackathon")` in `app/(hackathon)/layout.tsx:13`, Rollen `hackathon_participant` / `hackathon_partner` in `lib/areas.ts:65–68` | | |
| Anmeldung durch jede Person, danach Auswahl („Approval required“) | Bewerbung nur, wer die Rolle schon hat | **anders** — im Portal gibt es keinen Selbstregistrierungsweg in den Bereich; die Rolle muss vorher vergeben werden | `layout.tsx:13`, `lib/areas.ts:65–68`; kein RPC, der `hackathon_participant` beim Bewerben vergibt (0085) | | |
| Zu-/Absage aus Luma heraus | `set_hack_application_status(applied / accepted / declined)` | **fehlt** — die RPC ist gebaut, hat aber **keine Oberfläche**: Bewerbungen lassen sich derzeit nicht annehmen oder ablehnen | `20260914095624_v4_hackathon.sql:503–516`; Suche nach `hack_application` und `set_hack_application_status` in `app/` und `lib/` ohne Treffer | | |
| Platzkontingent (350) und „Went“-Zähler | — | **fehlt** — keine Kapazität, keine Zählung, keine Warteliste | `hack_application`-Status nur applied/accepted/declined/withdrawn (0085:159) | | |
| Altersgrenze 18–35 | — | **fehlt** — keine Prüfung (anders als bei Volunteers, wo 18 geprüft wird) | `apply_hackathon` (0085:299–325) prüft nur Skills gegen das Vokabular | | |
| Mails und Erinnerungen über Luma | — | **fehlt** — keine Mail-Vorlage zum Hackathon | Suche nach `hack` in den Mail-Vorlagen und `queue_mail`-Migrationen ohne Treffer | | |
| „9 challenges, 6 teams per challenge, 3–5 people per team“ als Text | Teamgröße 3–8 (Ziel 6) technisch durchgesetzt | **anders**, strenger (E5) | Maximum 8 doppelt: RPC `join_hack_team` (0085:378) und Trigger `trg_hack_team_size` (0085:116–130); Minimum 3 bei der Einreichung ⇒ `team_too_small` (0085:419–421) | | |
| Luma ans CRM anschließen (Webhook, Entscheidung 08.09.) | — | **fehlt** — kein Luma-Adapter; ob einer gebraucht wird, hängt daran, ob die Anmeldung 2027 im Portal läuft | Suche nach `luma` in `app/`, `lib/`, `supabase/` ohne Treffer | | |

---

## 2 · Airtable „FLS26 – Hackathon Applications“ (512 Zeilen)

| Alte Seite / Funktion | Neu (Pfad) | Status | Beleg | Prüfung Konrad | Prio |
|---|---|---|---|---|---|
| Bewerbungsformular (prefilled „Unique Onboarding Form“) | `/hackathon`, Bewerbungskarte | **anders** — Login statt Einmal-Link | `apply_hackathon` (0085:299–325), `app/(hackathon)/hackathon/HackView.tsx:190–247` | | |
| **Skills** (14 Werte: ML/DL, NLP, CV, Data Sci/Eng, Frontend, Backend/APIs, Cloud/DevOps, Cybersecurity, Robotics/IoT, Prompt Eng/LLM Apps, Product Design/UX, Business Strategy/GTM, Project Mgmt) | `hack_application.skills[]`, Vokabular `hack_skill` | **anders** — **6 statt 14 Werte**: frontend, backend, data, design, business, hardware | `20260914095624_v4_hackathon.sql:33–38`, Prüfung `:307–312` | | |
| **Profession** (Bachelor/Master · Dual · PhD/Postdoc · Founder · Freelancer · Professional) | — | **fehlt** im Hackathon; vergleichbare Felder gibt es nur im Talent-Profil (`occupation_status`, `career_level`) | `hack_application` (0085:145–160) hat kein Berufsfeld | | |
| **„How did you hear about us“** (10 Werte) | — | **fehlt** im Hackathon; im Talent-Profil existiert `person_acquisition_channel` | `app/(talent)/profil/ProfileForm.tsx:337`; kein Feld in `hack_application` | | |
| **Dietary** (Omnivore / Vegetarian / Vegan) | — | **fehlt** im Hackathon; Ernährung gibt es für Speaker und Volunteers (`person.diet`, Migration 0100), aber ohne Bezug zum Hackathon | Suche nach `dietary` repoweit ohne Treffer; `app/(produktion)/produktion/catering/page.tsx` wertet nur Speaker/Volunteers aus | | |
| **Overnight Stay** | — | **fehlt** | Suche nach `overnight` / `übernachtung` repoweit ohne Treffer | | |
| **CV / Empfehlungen** (2025er Tabellen) | — | **fehlt** — kein Upload im Hackathon-Bereich | `hack_application` (0085:145–160) | | |
| Motivation (Freitext) | `hack_application.motivation` | **vorhanden** | 0085:317, `HackView.tsx:228–230` | | |
| **Team Name als Freitext** in der Bewerbung | `hack_application.team_pref` (Freitext „Wen willst du im Team?“) **plus** echte Team-Objekte | **anders**, besser — der Wunsch bleibt Text, das Team ist eine Tabelle mit Mitgliedschaft | 0085:317; `hack_team` / `hack_team_member` (0085:78–130) | | |
| Status (confirmed approval · declined · Absage nach Confirmation) | `hack_application.status` = applied / accepted / declined / withdrawn | **anders** — „Absage nach Confirmation“ hat kein eigenes Gegenstück | 0085:159 | | |
| Keine Verknüpfung Application ↔ Participant | eine Zeile je Person und Edition, Team über Fremdschlüssel | **vorhanden**, behebt den Bruch | `unique (person_id, edition_id)` (0085:158); `hack_application.team_id` (0085:381) | | |
| Consent / Einwilligung | — | **fehlt** — anders als bei Volunteers (`consent_required`) und Talent (Onboarding) verlangt `apply_hackathon` keine Einwilligung | `apply_hackathon` (0085:299–325) ohne Consent-Prüfung | | |

---

## 3 · Airtable „Hackathon 2026 – Participants“ (310 Zeilen)

| Alte Seite / Funktion | Neu (Pfad) | Status | Beleg | Prüfung Konrad | Prio |
|---|---|---|---|---|---|
| Zugesagte Teilnehmer als eigene Tabelle | `hack_application.status = 'accepted'` | **anders**, besser — ein Vorgang statt zweier Tabellen | 0085:159 | | |
| **Challenge** je Teilnehmer (Select, 7 belegt) | `hack_challenge` als Objekt, Zuteilung an **Teams**, nicht an Personen | **anders**, besser | `hack_challenge` (0085:46–65), `assign_challenges` verteilt gleichmäßig auf Teams (0085:469–491), `set_team_challenge` (0085:493–501) | | |
| Freie Challenge-Wahl | keine Wahl, Zuteilung durch das Team mit Ausgleich | **anders**, mit Absicht (E5) | `app/(hackathon)/hackathon/challenges/page.tsx:12–15`, `assign_challenges` (0085:475–484) | | |
| **Vivenu Customer ID / Barcode / FLS26 Ticket** | — | **fehlt** — für Hackathon-Teilnehmer wird kein Ticket und kein Coupon erzeugt (anders als bei Volunteers) | Suche nach `hack` in `lib/vivenu/` ohne Treffer; keine Ticket-Logik in 0085/0089 | | |
| **Swapcard Profile created** | — | **fehlt** — die Event-App-Anbindung gibt es nur für Partner/Aussteller | Suche nach `hack` in `lib/event-app/` ohne Treffer; `app/(partner)/partner/event-app/page.tsx` | | |
| **Briefing-Wellen** (Briefings 01.04. / 06.04. als Checkbox je Person) | — | **fehlt** — kein Kommunikations-Log, keine Briefing-Kennzeichen | keine Spalte in `hack_application` (0085:145–160) | | |
| Teams nur als Freitext | `hack_team` mit Kapitän, Mitgliedschaft, Join-Code, Status | **vorhanden**, neu | `hack_team` / `hack_team_member` (0085:78–130), `hack_join_code` (0085:328–333), `create_hack_team` / `join_hack_team` / `leave_hack_team` (0085:336–408) | | |
| Keine Submissions-Tabelle | `hack_submission` (Projektlink, Repo, Notiz) | **vorhanden**, neu | `hack_submission` (0085:162–173), `submit_hack` (0085:410–433), `HackView.tsx:297–346` | | |
| — | Datei-Upload zur Einreichung | **fehlt** — die Spalte `hack_submission.files` existiert, wird aber von keiner RPC gefüllt und hat keine Oberfläche | 0085:162–173; `submit_hack` schreibt nur `url`, `repo_url`, `notes` (0085:424–425) | | |
| — | Einreichungsfrist | **fehlt** — im Code ausdrücklich vermerkt | `20260914095624_v4_hackathon.sql:21–22` | | |
| Keine Judging-Tabelle (Bewertung außerhalb) | `hack_judging_score` mit Kriterien und Gewichten, Gesamtnote in der Datenbank gerechnet | **vorhanden**, neu (E4) | `set_hack_score` 0–10 je Kriterium ⇒ `invalid_score` (0085:602–633), `unique (team_id, judge_id)` (0085:185), `/hackathon/judging` | | |
| — | Ranking / Gewinnerermittlung | **fehlt** — es gibt nur Anzahl Bewertungen und Durchschnitt je Team | `hack_admin_overview` (0089:113–114); kein Ranking-RPC | | |
| Keine Schedule-Tabelle (Ablauf nur im Wiki) | `/hackathon/schedule` aus dem Programm-Board | **vorhanden**, neu — kein eigenes Datenmodell, sondern Sessions des Events mit `format_tag = 'hackathon'` | `app/(hackathon)/hackathon/schedule/page.tsx:41–51` über die View `programme_public` (`20260908142441_v2_edition_programme.sql:485`) | | |

---

## 4 · Airtable „Hack26 – Feedback & Warteliste 27“ (29 Zeilen)

| Alte Seite / Funktion | Neu (Pfad) | Status | Beleg | Prüfung Konrad | Prio |
|---|---|---|---|---|---|
| Feedback / NPS (Rating, Challenge, Top/Flop) | — | **fehlt** — keine Tabelle, keine Seite | Suche nach `nps` repoweit ohne Treffer; keine Feedback-Tabelle in `supabase/migrations/` | | |
| Warteliste für die nächste Edition | — | **fehlt** — der Hackathon kennt keine Warteliste (Sessions und Volunteers schon) | `hack_application`-Status ohne `waitlisted` (0085:159); `promote_waitlist` gibt es nur für Session-Bewerbungen (`20260908144639_v2_application_ticket.sql:428`) | | |

---

## 5 · Übrige Tabellen: Professoren (99), Vorjahre 2025 / 2024

| Alte Seite / Funktion | Neu (Pfad) | Status | Beleg | Prüfung Konrad | Prio |
|---|---|---|---|---|---|
| **Professoren** (Uni, Status) als Multiplikatoren-Outreach | — | **fehlt** — kein Outreach-Verzeichnis im Portal | Suche nach `multiplikator` repoweit ohne Treffer; `professor` nur als Akquise-Kanal im Talent-Profil (`20260721160705_seed_vocab.sql:168`) | | |
| **Jahr = eigene Tabelle** (2024, 2025, 2026) | Edition-Dimension: alles hängt an `edition_id` | **anders**, besser (Inventar §7 Muster 8) | `hack_application.edition_id`, `hack_team`, `hack_challenge` je Edition (0085) | | |
| „Helped before“ / Vorjahres-Teilnahme sichtbar | — | **fehlt** für den Hackathon; `lifecycle_status = 'alumni'` wird generisch aus Registrierungen abgeleitet, ohne Hackathon-Bezug | `20260721160701_core_schema.sql:232–233` | | |
| 2024: Startup-Phase, Funding, Pitch Deck | — | **fehlt** im Hackathon (Startup-Phase gibt es im Talent-Profil) | `app/(talent)/profil/ProfileForm.tsx` (`startup_phase`) | | |

---

## 6 · Discord

| Alte Seite / Funktion | Neu (Pfad) | Status | Beleg | Prüfung Konrad | Prio |
|---|---|---|---|---|---|
| Discord als Kommunikationskanal, Einladung über Mail/Wiki | Kachel „Discord“ auf `/hackathon` mit Link | **vorhanden** (E3), **aber nur wenn die Umgebungsvariable gesetzt ist** — sie ist im Entscheidungslog als offen vermerkt | `app/(hackathon)/hackathon/page.tsx:32` liest `HACKATHON_DISCORD_URL`, `HackView.tsx:178–185` rendert nur dann; `.env.local.example:51–52`; Entscheidungslog 14.09. „Discord-URL später“ | | |
| Kanal je Team / je Challenge | Spalte `hack_team.discord_url` | **fehlt** — die Spalte existiert und wird von `my_hack` ausgegeben, aber von keiner RPC geschrieben und in keiner Oberfläche angezeigt | `20260914095624_v4_hackathon.sql:82`, `:285`, `20260914104906_v4_hackathon_sprache.sql:83`; `app/(hackathon)/hackathon/types.ts:22`; `HackView` zeigt nur die globale URL | | |
| Kein Discord-Feld je Teilnehmer (Lücke des Altsystems) | — | **fehlt** weiterhin — Discord-Handle wird nirgends erfasst | `hack_application` (0085:145–160) | | |

---

## 7 · Partner-Sicht (SoftR Partner Hub, Seite „Hackathon“; Airtable `Customer-Data` „Hack – …“)

| Alte Seite / Funktion | Neu (Pfad) | Status | Beleg | Prüfung Konrad | Prio |
|---|---|---|---|---|---|
| Eigene Hackathon-Seite im Partner Hub, sichtbar bei Product Type = Hackathon | **keine Hackathon-Seite im Partner-Portal**; der Zugang läuft über die Checkliste und über den Bereich `/hackathon` | **anders** — der Partner wechselt für Jury und Teams den Bereich, statt alles im Partner-Menü zu finden | Suche nach `hack` in `app/(partner)/**` ohne Treffer; `app/(partner)/partner/nav.ts:19–31` ohne Hackathon-Punkt | | |
| **Challenge-Formular** des Partners | Pflichtposten in `/partner/checkliste`, Vorlage `hackathon_challenge` | **vorhanden**, besser — an das gebuchte Produkt gebunden, mit Frist und Fortschritt | `deliverable_template` Schlüssel `hackathon_challenge`, `product_sku = 'I-37220'`, `required = true`, `due_rule {"weeks_before": 8}` (0085:637–666); Sichtbarkeit nur bei `org_product.status = 'booked'` (`20260910163331_v3_partner_deliverables.sql:135–142`) | | |
| Challenge-Felder: Titel, Beschreibung, **Preise**, Mentoren, Ressourcen | genau diese Felder im Formular | **vorhanden** | Formularfelder `title_en`, `description_en`, `prizes`, `resources`, `mentor_names` (0085:646–659) | | |
| — | Judging-Kriterien mit Gewichten trägt der Partner ein | **vorhanden**, neu (E4) | `criterion_1_label` + `criterion_1_weight` (Pflicht), 2–4 optional (0085:646–659); Umwandlung in `hack_challenge.criteria` durch `publish_hack_challenge` (0085:525–569) | | |
| Challenge sofort sichtbar (kein Review) | Freigabe durch das Hackathon-Team | **anders**, mit Absicht — nur `status = 'published'` erreicht die Teilnehmer | `publish_hack_challenge` verlangt `is_hack_team()` (0085:529); Filter auf `published` (0085:257, 0089:55); Knopf in `/hackathon/teams` (`TeamsView.tsx:64–71`) | | |
| Challenge zweisprachig | nur Englisch im Formular | **anders** (E7: Hackathon nur EN); die Spalten `title_de`/`description_de` existieren, werden aber nicht abgefragt | 0085:46–65; `20260914104906_v4_hackathon_sprache.sql:6–9` | | |
| **Speed-Dating** (Partner ↔ Teilnehmer) | — | **fehlt** — kein Termin, keine Zuordnung, keine Anzeige | Suche nach `speed` repoweit ohne Treffer | | |
| **Backdrop / Standbranding Hackathon** | allgemeine Rückwand-Pflicht in der Partner-Checkliste | **anders** — kein eigener Hackathon-Posten | `deliverable_template` `backdrop_print` (Welle 3), `app/(partner)/partner/checkliste/page.tsx` | | |
| **Team-Formular** (Partner meldet eigene Leute an) | — | **fehlt** — es gibt keinen Weg, Partner-Mitarbeitende als Hackathon-Team oder Mentoren-Konten anzulegen; `mentor_names` ist reiner Text | 0085:554–557 (Zerlegen an Zeilenumbrüchen) | | |
| Partner sieht Teams und Einreichungen | `/hackathon/judging`, beschränkt auf Teams der **eigenen** Challenge | **vorhanden**, enger als vorher | `can_judge_hack_team` (0085:218–224), Filter in `hack_judging` (0089:140), Prüfung in `set_hack_score` (0085:612); `/hackathon/teams` bleibt dem Partner verschlossen (404, `teams/page.tsx:21`) | | |
| Partner sieht **Bewerberdaten** (E-Mail, LinkedIn, CV) ohne Einwilligung (Befund Inventar §7.12) | Partner sieht keine Hackathon-Bewerbungen | **bewusst weggelassen** — Datenminimierung; `/partner/bewerber` führt nur Sessions mit Bewerbungsverfahren, nicht `hack_application` | `app/(partner)/partner/bewerber/page.tsx:16,25` über `partner_sessions`; `hack_application` dort nicht angebunden | | |
| 10 Felder „Hack – …“ auf der Partner-Org (Onboarding-Stand) | Fortschritt der Checkliste je Leistung | **anders** | `/partner/checkliste`, Fortschritt „done/total“ (`checkliste/page.tsx:70–72`) | | |
| Harte Hackathon-Fristen im SoftR-Countdown (20.03. / 31.03. / 06.04.) | `deliverable`-Fälligkeit aus `due_rule` je Edition | **anders**, besser | `due_rule {"weeks_before": 8}` (0085:645) | | |

---

## 8 · Wiki und Ablauf

| Alte Seite / Funktion | Neu (Pfad) | Status | Beleg | Prüfung Konrad | Prio |
|---|---|---|---|---|---|
| Notion „AI Hackathon 2026: Wiki“ (~3.000 Wörter) inkl. „Zeitlicher Ablauf für Teilnehmende“ | **kein Wiki im Hackathon-Bereich** — die Wissensbasis kennt die Zielgruppe `hackathon`, es gibt aber weder eine Seite noch Artikel | **fehlt** | Vokabular `kb_audience` enthält `hackathon` (`20260914095053_v4_wissensbasis.sql:31`), Rechteregel `can_edit_kb` ebenso (`:112`); es existiert keine Datei `app/(hackathon)/hackathon/wiki/`, und der Seed 0096 legt keinen Artikel mit dieser Zielgruppe an | | |
| Zeitlicher Ablauf als Text im Wiki | `/hackathon/schedule` aus dem Programm | **anders**, besser — gepflegt wird im Programm-Board, nicht im Fließtext | `schedule/page.tsx:41–51` | | |
| Owner des Hackathon-Wikis | im Arbeitsauftrag „voraussichtlich Emilio“, Rolle `area_lead_hackathon` existiert | **fehlt** — nicht gesetzt; die Rolle und die Rechteregel gibt es | Arbeitsauftrag Welle 4, E7; `can_edit_kb` (`20260914095053:112`) | | |

---

## Fragen an Konrad

1. **Wer darf sich bewerben?** Heute braucht man die Rolle `hackathon_participant`, bevor man das Formular überhaupt sieht — es gibt keinen offenen Weg hinein. Soll die Bewerbung jeder eingeloggten Person offenstehen (wie bei Volunteers), oder bleibt die Vorauswahl außerhalb des Portals?
2. **Annahme und Absage:** Die RPC dafür ist gebaut, eine Oberfläche nicht. Wo soll das liegen — eigener Reiter unter `/hackathon/teams` oder in `/admin/bewerbungen`?
3. **Bewerbungsfelder:** Aus dem Altbestand fehlen Profession, „Wie hast du davon gehört“, Ernährung, Übernachtung, CV und Empfehlungen. Welche davon braucht FLS27 wirklich — und gehören Ernährung und Übernachtung nicht ohnehin zur Person statt zur Bewerbung?
4. **Skills:** 6 Werte statt der 14 aus 2026. Reicht die kürzere Liste für die Teamzusammenstellung, oder soll sie zurück auf die alte Feinheit?
5. **Ticket und Event-App:** Hackathon-Teilnehmer bekommen im neuen Portal weder Ticket/Coupon noch Swapcard-Profil. Sollen sie einen Crew-/Talent-Pass über einen eigenen Undershop bekommen (wie die Volunteers), und sollen sie in die Event-App?
6. **Kapazität und Warteliste:** 350 Plätze waren die Steuergröße. Soll das Portal Plätze zählen und eine Warteliste führen?
7. **Speed-Dating und Partner-Team-Formular** aus dem alten Partner Hub gibt es nicht. Fallen sie weg, oder werden sie gebraucht?
8. **Hackathon-Wiki:** Zielgruppe und Rechte sind vorbereitet, Seite und Inhalte fehlen. Wer ist Owner, und woher kommt der Startbestand — Export der Notion-Seite?

## Nicht geprüft

- **Nichts am Gerenderten.** Alle Zeilen sind Codebefunde. Die Lehre aus F4 gilt: ein serverseitiger Abruf zeigt nur den ersten Zustand einer Seite; ob eine Funktion mit echten Daten trägt, zeigt erst der Walkthrough.
- **Keine Daten.** Ob Challenges, Teams oder Bewerbungen in Frankfurt existieren, wurde nicht abgefragt.
- **Luma wurde nicht erneut aufgerufen.** Grundlage ist `docs/legacy-inventar.md` §3 vom 07.09.2026 (Luma bewirbt 9 Challenges, belegt waren 7 — welcher Stand für 2027 gilt, ist offen).
- **Die Airtable-Base `appVO7yVsIZzdd2Bm` wurde nicht erneut ausgelesen.** Die Feldlisten stammen aus dem Inventar, nicht aus einem frischen Abzug; insbesondere die ~40 Felder der Participants-Tabelle sind dort nur zusammengefasst.
- **Discord:** Der Kanal selbst wurde nicht angesehen; welche Struktur (Kanäle je Challenge, je Team) dort bestand, ist nicht erhoben.
- **Notion „AI Hackathon 2026: Wiki“** wurde nicht Artikel für Artikel gelesen.

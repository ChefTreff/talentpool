# Design-Vorschläge · 05.10.2026

Ein Punkt, für den der Design-Chat einen **Vorschlag** liefert und der zuständige Chat **baut** (nach Konrads Go). Alles ist aus vorhandenen Tokens und Bausteinen gebaut; neu sind zwei Kit-Bausteine ohne Daten (`Stufenleiste`, `Block`) und zwei kleine Erweiterungen (`Menu ton="hell"`, `InfoList schmal`).

| Punkt | Seite | baut | Kern |
|---|---|---|---|
| [LEAD-055](#1--lead-055-das-personen-fenster-der-pipeline-aufräumen) | Personen-Fenster in `/speaker-leads` (Pipeline und Bestätigte) und Detailseite `/admin/speaker/[id]` | Speaker-Chat | Oben der Kopf mit **einer** Hauptaktion und der Stufenleiste, darunter fünf aufklappbare Blöcke in fester Reihenfolge; was die Rolle oder der Stand nicht zeigt, wird nicht gezeichnet |

Gemeinsam: `<h2>`/`<h3>` mit Pflicht-Ebene wie bei `CardHeader`, Zustand immer in Form **und** Wort (Design-Regel 4), kein neuer Radius, keine neue Farbe, Touch-Ziele 44 px, DE und EN. Die Bilder zum Vorschlag zeigen eine lokale Vorschau mit erfundenen Daten; sie liegen nicht im Repo (Konrad bekommt sie als Datei, der Speaker-Chat die Vorschauseite auf Anfrage).

---

## 1 · LEAD-055 Das Personen-Fenster der Pipeline aufräumen

**Anlass:** Konrad und Paulina (Feedbackrunde 05.10.): das Pop-up ist „noch sehr unübersichtlich“. LEAD-055 verlangt die Blöcke Grunddaten / Pipeline / Onboarding / Hospitality / Programm, nur die zum Stand passenden, die Aktionen oben und **den nächsten sinnvollen Schritt als eine Hauptaktion**; LEAD-053 eine reduzierte Fassung für Stage Leads; LEAD-054 (gebaut, #348) hat die Stände vor und nach der Zusage getrennt. Der Speaker-Chat hat um einen Entwurf gebeten (Aufbau, Kit-Bausteine, Handy) und bittet, die Admin-Detailseite `/admin/speaker/[id]` mitzudenken.

### Was heute im Fenster steht (nach #348)

Zwei Spalten ab 1024 px, **sieben (vor der Zusage) bis zehn (danach) gleichrangige Abschnitte**, alle offen, alle mit derselben Überschrift (`ct-label`):

- Kopf: Name, Stand-Badge, Gast- und Assistenz-Badge, Einladungsdatum, E-Mail.
- Dann entweder die Zusage-Karte („Hat die Person zugesagt?“) oder die Karte „Nächste Schritte“ (Pflichten aus `naechstePflichten`).
- Links: Pipeline (bis zu acht Stand-Knöpfe, Zeitstempel, Absage-Panel), Einordnung.
- Rechts: Foto, Verlauf, Stammdaten (mit zwei Haken, die erst nach der Zusage erscheinen), Team-Felder, Sessions und offene Schritte, Betreuung weitergeben, Reisekosten.
- Fußleiste: Speichern (primär), Einladung, Schließen.

Was daran unübersichtlich ist: Es gibt keine Rangfolge (der Stand steht als Knopf Nummer vier unter acht gleichen); die nächste Handlung ist **nicht** der auffälligste Knopf (die Zusage ist `secondary`, weil „Speichern“ der einzige primäre ist); das Auge muss im Zickzack zwischen zwei Spalten wechseln (Verlauf rechts oben, Pflichten über beiden); und am Handy stehen bis zu zehn Abschnitte untereinander, alle offen.

### Die Idee in einem Satz

**Oben steht, wer das ist, wo er steht und was als Nächstes zu tun ist; darunter nur noch Blöcke, von denen offen ist, was zum Stand gehört.**

1. **Der Kopf trägt die Rangfolge:** Person, **eine** Hauptaktion (primär), „Weitere Aktionen“ (zweitrangig, mit Pfeil), die Stufenleiste (wo der Speaker im Ablauf steht) und eine Zeile Kontext (Betreuung, Als Nächstes, E-Mail).
2. **Fünf Blöcke in fester Reihenfolge:** Grunddaten, Pipeline, Onboarding, Hospitality, Programm. Die Reihenfolge ändert sich nie, nur was offen ist. Jeder Block ist eine Zeile mit Titel, Zustandsmarke und Kurzfassung und klappt auf.
3. **Eine Spalte** — im Fenster, auf der Seite und am Handy. Zwei Spalten gibt es nur **innerhalb** eines Blocks (Pipeline: Verlauf | Einordnung).
4. **Was die Rolle oder der Stand nicht zeigt, wird nicht gezeichnet** — kein zugeklappter Block mit Schloss, keine Lücke. Ein fehlender Block ist keine Information.

### Aufbau

```
Desktop (Modal wide, max. 1024 px)                             Handy (375 px)
┌──────────────────────────────────────────────────────────┐   ┌────────────────────────────┐
│ [A]  Dr. Anna Beispiel-Mustermann            Schließen   │   │ [A]  Dr. Anna Beispiel-... │
│      Head of Talent - Beispiel Beratung GmbH             │   │      Head of Talent - ...  │
│      [Keynote] [Technology] [Prio A] [Assistenz: Mia]    │   │      [Keynote] [Technology]│
│                                                          │   │                            │
│ [ Hat bestätigt ]  [ Weitere Aktionen  v ]               │   │ [ Hat bestätigt         ]  │
│ (Aktionspanel unter der Zeile, nur wenn gewählt)         │   │ [ Weitere Aktionen    v  ] │
│                                                          │   │                            │
│ ==== ==== ---- ---- ---- ---- ----    <- Stufenleiste    │   │ == == -- -- -- -- --       │
│ Lead Kontaktiert Bestätigt Onboarding ... Teilgenommen   │   │ Kontaktiert - Schritt 2/7  │
│ Betreut von Leo - Als Nächstes ... [Frist] - E-Mail      │   │ Betreut von Leo            │
│ -------------------------------------------------------- │   │ Als Nächstes ...           │
│ Grunddaten                 Foto fehlt - keine Notiz    v │   │ -------------------------- │
│ -------------------------------------------------------- │   │ Grunddaten               v │
│ Pipeline                                               ^ │   │ Pipeline                 ^ │
│   Verlauf (Formular, Liste)    |  Einordnung             │   │   Verlauf ...              │
│   ...                          |  ...                    │   │   Einordnung ...           │
│ -------------------------------------------------------- │   │ Onboarding [Nächste P.]  v │
│ Onboarding   [Nächste Pflicht]                         v │   │ Hospitality [Offen - 2]  v │
│ Hospitality  [Offen - 2]                               v │   │ Programm [Offen]         v │
│ Programm     [Offen]                                   v │   │ =================== klebt  │
│ ================================================= klebt  │   │ [ Änderungen speichern ]   │
│ [ Änderungen speichern ]   Schließen                     │   │   Schließen                │
└──────────────────────────────────────────────────────────┘   └────────────────────────────┘
```

Die Skizze zeigt den Stand *Kontaktiert* und zusätzlich die drei Zeilen, die erst **nach der Zusage** dazukommen (Onboarding, Hospitality, Programm); davor endet das Fenster bei der Pipeline.

Die Bausteine in der Reihenfolge, in der sie im Code stehen (das Gerüst ist die heutige `SpeakerFenster.tsx`, nur anders sortiert):

```tsx
<Modal label={name} onCancel={schliessen} size="wide" error={fehler}>
  {/* Kopf: Identität · Aktionszeile · Aktionspanel · Stufenleiste · Kontextzeile */}
  <PortraitShape name={name} photoUrl={foto} size="sm" />            {/* + h2.ct-h3, Badges */}
  <Button>{hauptaktion.text}</Button>                                {/* primär, nur wenn es eine gibt */}
  <Menu ton="hell" label={t.moreActions} trigger={<span>{t.moreActions}</span>}> … <MenuItem/> … </Menu>
  <Stufenleiste label={t.stageLabel} zaehler={t.stageCounter…} schritte={STUFEN} aktuell={status} ende={abgesagt ? t.declined : undefined} />
  <dl>Betreut von · Als Nächstes <FristMarke kompakt …/> · E-Mail</dl>

  {/* Blöcke: Reihenfolge fest, offen/zu nach Stand */}
  {zeigeGrunddaten && <Block id="grunddaten" ebene="h3" titel={t.blockBasics} kurz={…} offen={false}>…</Block>}
  <Block id="pipeline" ebene="h3" titel={t.blockPipeline} kurz={…} offen={!nachZusage}>…</Block>
  {nachZusage && <Block id="onboarding" … marke={marke("onboarding")} offen={naechster === "onboarding"}>…</Block>}
  {nachZusage && <Block id="hospitality" … />}
  {nachZusage && <Block id="programm" … />}

  {/* Fußleiste: <ModalFuss> aus dem Kit (QS-068) — klebt unten und läuft mit dem Polster des Fensters bis an den Rand */}
</Modal>
```

### Der Kopf

- **Person:** `PortraitShape size="sm"` (56 px, mit Foto, sobald eins da ist), Name als `h2` (`ct-h3`), darunter Jobtitel · Organisation, dann die Badges: Rolle (`speaker_type`), Kategorie, **Prio nur für das Team**, „Gast des Partners“ (SPK-070, mit dem Hinweis darunter wie heute), „Assistenz: Name“. „Schließen“ bleibt oben rechts (ghost); am Handy steht es nur in der Fußleiste, damit der Name die ganze Breite hat.
- **Aktionszeile:** links die **Hauptaktion** (`Button`, primär, 40 px / am Handy 44 und eine volle Zeile), daneben **„Weitere Aktionen“** (`Menu ton="hell"`: Rand, Pfeil, 40/44 px — sieht aus wie ein Knopf, der aufklappt, und nicht wie ein zweiter Hauptknopf).
  - Menüeinträge: *Betreuung weitergeben …* (Team: jeder; Stage Lead nur eigene, wie heute), *Stand ändern …*, *Einladung erneut schicken* (nach der Zusage, nicht für Gäste, nur wenn schon eingeladen), Trennlinie, *Hat abgesagt …*.
  - Ein Eintrag mit „…“ öffnet ein **Aktionspanel** direkt unter der Zeile — dieselbe Fläche wie heute das Absage-Panel (`bg-canvas`, Rand): Grund der Absage wählen, Stand wählen, Person für die Übergabe wählen. Kein Dialog über dem Dialog.
  - Was eine **Mail an den Speaker** auslöst (Einladung), fragt vorher mit `ConfirmDialog` und nennt die Adresse.
- **Stufenleiste** (`Stufenleiste`, neu): sieben gleich breite Stücke von Lead bis Teilgenommen; erledigte gefüllt, die aktuelle **dicker** und mit **fettem** Namen, die übrigen blass. Sie **liest nur** — geändert wird der Stand über die Hauptaktion und das Menü. Am Handy stehen die Namen nicht unter den Stücken, sondern eine Zeile „Bestätigt · Schritt 3 von 7“. „Abgesagt“ ist ein Ergebnis, kein Schritt: die Leiste steht still (Stücke blass), davor steht das Wort „Abgesagt“ in `error-ink`.
- **Kontextzeile:** *Betreut von* · *Als Nächstes* · *E-Mail* (oder der Satz „Kontakt nicht sichtbar“ wie heute). *Als Nächstes* ist vor der Zusage die früheste offene Aufgabe des Verlaufs (`next_task`, mit `FristMarke kompakt`), nach der Zusage der Text der ersten offenen Pflicht (`duty_*`, ohne erfundene Frist) — erst wenn keine Pflicht mehr offen ist, wieder `next_task`. Nach einer Absage steht statt dessen *Abgesagt am 03.10. · Terminkonflikt*.

### Die Hauptaktion

Genau eine, primär, **das Verb des nächsten Schritts** — nie der Name eines Stands. Sie ist die erste Aktion, die **diese Rolle** erledigen kann; gibt es keine, steht keine da (Leiste und Marken zeigen, wer dran ist).

| Stand | Bedingung | Hauptaktion (DE) | Wirkung |
|---|---|---|---|
| Lead | — | Als kontaktiert markieren | Stand → Kontaktiert |
| Kontaktiert | `kannZusageMelden` | **Hat bestätigt** | Stand → Bestätigt; Onboarding, Hospitality, Programm erscheinen; Onboarding öffnet sich |
| Bestätigt ff. | Pflicht `invite` offen | **Einladung ins Portal schicken** | `ConfirmDialog` mit Adresse, dann `inviteSpeaker` |
| | Pflicht `hospitality` (nur Speaker-Team) | Hospitality festlegen | `ButtonLink href="#hospitality"` — der Block öffnet sich beim Anker |
| | Pflicht `travel` (nur Speaker-Team) | Reisekosten freigeben | wie heute `approveTravelCosts` |
| | Pflicht `session` (Programm-Team) | Im Programmboard zuordnen | Link ins Board (`/speaker-leads/board`, im Admin `/admin/programm`) |
| | keine Pflicht offen | — | Kontext: „Auf unserer Seite ist nichts offen“ (`dutiesDone`) |
| Abgesagt | — | — | die Sache ist entschieden; *Stand ändern …* bleibt im Menü |

Die Reihenfolge der Pflichten ist die von `naechstePflichten()` (`phase.ts`): Einladung, Hospitality, Reisekosten, Session. Die Funktion bleibt die **einzige Quelle** — Hauptaktion, Marken und die Zeile „Als Nächstes“ lesen alle aus ihr. Eine Tabelle von Stand zu Knopf zu pflegen wäre die zweite Quelle, die beim nächsten Stand auseinanderläuft.

### Die Blöcke

| Block | Inhalt (heute → hier) | Marke | Beim Öffnen |
|---|---|---|---|
| **Grunddaten** | Rolle, Jobtitel, Organisation, Foto (`PhotoUpload`), Interne Notiz | keine | zu; Kurzfassung sagt, was **nicht** im Kopf steht („Foto fehlt · keine interne Notiz“) |
| **Pipeline** | **Verlauf** (links: das Formular der `Verlauf`-Komponente, darunter die Einträge, offene Aufgaben zuerst) und **Einordnung** (rechts: Kategorie, Themencluster, Prio, Format, Thema/Rolle, Kontakt via, Bühnen in Frage); Zeitstempel | keine | vor der Zusage **offen**, danach zu; Kurzfassung „Letzte Aktivität 03.10. · 1 offene Aufgabe“ bzw. „Bestätigt am 04.10. · Kategorie Technology · Prio A“ |
| **Onboarding** | E-Mail für die Einladung, Einladung (Status „Eingeladen am …“ oder Knopf), Offene Schritte des Speakers (`next_open`) | Pflicht `invite` | offen, wenn es die nächste Pflicht ist |
| **Hospitality** | Team: Pass-Typ, Hotel-Kategorie, Hotel/Shuttle, Lounge-Zugang. Alle: „Reisekosten vorgesehen“, Reisekosten-Status; Team: Freigabe | Pflichten `hospitality`, `travel` | zu, wenn nicht die nächste Pflicht |
| **Programm** | Sessions (Titel · Bühne · Zeit · Status) mit Link ins Board; **Side Events** (erst mit ADM-077/SPK-091, siehe unten) | Pflicht `session` | zu, wenn nicht die nächste Pflicht |

**Die Marke eines Blocks** kommt aus `naechstePflichten()` — nichts wird doppelt gepflegt:

- keine offene Pflicht im Block → **Erledigt** (`success`);
- offene Pflichten, und es ist der **erste** Block in der Reihenfolge Onboarding → Hospitality → Programm → **Nächste Pflicht** (`accent`); er steht offen, und die Hauptaktion zeigt auf ihn;
- sonst **Offen** bzw. **Offen · 2** (`warning`), zugeklappt.
- Gäste von Partnern (`stage_guest`, SPK-070) haben weder Einladung noch Onboarding und keine Pflichten: kein Block Onboarding, keine Marken; der Hinweis `tg.hint` steht wie heute im Kopf.

**Die Kurzfassung** steht nur im zugeklappten Block, wiederholt nie, was der Kopf schon sagt, und **verrät nichts, was der Block der Rolle nicht zeigen darf** (für den Stage Lead steht in „Pipeline“ kein „Prio A“).

### Wer sieht was

Die Rechte setzt der Speaker-Chat; dies ist der Vorschlag für den **Aufbau** (Matrix: was gezeichnet wird, nicht was die Datenbank herausgibt).

| | Team und Admin | Stage Lead (LEAD-053) |
|---|---|---|
| Kopf | alles, mit Prio | Name, Organisation, Rolle, Kategorie, Stand, Betreuung, nächster Schritt; **keine Prio** |
| Grunddaten | ja | nur, wenn sie die Felder bearbeiten dürfen (heute dürfen sie) — sonst entfällt der Block, der Kopf trägt Name, Organisation, Rolle |
| Pipeline | Verlauf und Einordnung als Felder | Verlauf (sie sehen ihn und tragen ein, wie heute); Einordnung **ohne Prio**, lesend als `InfoList schmal` (oder mit Feldern, wenn sie sie bearbeiten dürfen) |
| Onboarding | nach der Zusage | nach der Zusage |
| Hospitality | nach der Zusage, alle Felder | nach der Zusage: „Reisekosten vorgesehen“ und Status; der Rest als Satz „… setzt das Speaker-Team“ (wie heute die Team-Felder: gar nicht sichtbar) |
| Programm | nach der Zusage | nach der Zusage, Sessions lesend |

Ein Block, den die Rolle nicht sehen darf, steht **nicht im Baum** (auch nicht zugeklappt) — wie heute `{isTeam && nachZusage && …}`.

### Von heute nach morgen

| Heute | Morgen |
|---|---|
| Zusage-Karte „Hat die Person zugesagt?“ | Hauptaktion „Hat bestätigt“; der Satz `pipelineLockedHint` steht als `ct-help` unter der Aktionszeile, solange der Stand vor der Zusage liegt |
| Karte „Nächste Schritte“ (Pflichten) | entfällt: Marken der Blöcke, Hauptaktion und Zeile „Als Nächstes“ zeigen dasselbe |
| Pipeline: bis zu acht Stand-Knöpfe | Stufenleiste (liest) · Hauptaktion · *Stand ändern …* (Auswahl, gefiltert wie `STAENDE_VOR_ZUSAGE`) |
| Absage-Panel in „Pipeline“ | Aktionspanel unter der Aktionszeile (gleiches Panel) |
| Einordnung (links) | Block Pipeline, rechts neben dem Verlauf |
| Verlauf (rechts oben) | Block Pipeline, links |
| Foto, Stammdaten | Block Grunddaten |
| Haken „Reception“ und „Reisekosten vorgesehen“ (stehen in den Stammdaten) | Block Hospitality — beide gehören zu Hospitality, vor der Zusage haben sie keine Bedeutung |
| Team-Felder | Block Hospitality |
| Sessions · Offene Schritte | Blöcke Programm · Onboarding |
| Betreuung weitergeben | Menü *Betreuung weitergeben …* mit Aktionspanel (Auswahl Person, Übergeben) |
| Reisekosten | Block Hospitality |
| Fußleiste: **Speichern** (primär), Einladung, Schließen | **Änderungen speichern** (zweitrangig, Umriss), Schließen; die Einladung ist Hauptaktion bzw. steht im Block Onboarding |

**Warum „Speichern“ nicht mehr der primäre Knopf ist:** Regel 1 („eine primäre Aktion pro Screen“). #348 hat die Zusage bewusst `secondary` gelassen, weil „Speichern“ der einzige primäre Knopf des Fensters war. LEAD-055 verlangt jetzt die Hauptaktion; dann ist **sie** der primäre Knopf, und Speichern ist die Nebenaktion — der Entwurf in den Blöcken ist selten die Aufgabe, wegen der man das Fenster öffnet.

### Handy

**Aufklappen in einer Spalte, keine Reiter.** Gründe: Die Blöcke sind die Übersicht — am Handy sieht man alle fünf Zeilen samt Marke auf einen Blick („Hospitality: Offen · 2“), das ist genau das „noch sehr unübersichtlich“, das behoben werden soll. Reiter würden diese Marken verstecken und wechseln mit dem Stand zwischen drei und fünf Stück. Die Zeile eines Blocks ist ohnehin ein 44-px-Ziel.

- Name und Organisation haben die volle Breite („Schließen“ nur in der Fußleiste); die Badges brechen um.
- Die Hauptaktion ist eine **volle Zeile** (44 px), darunter „Weitere Aktionen“. Der Text bricht nie auf zwei Zeilen.
- Die Stufenleiste zeigt die sieben Stücke und eine Zeile „Name · Schritt n von 7“; die Namen unter den Stücken entfallen.
- Kontextzeile: die drei Angaben untereinander; die Frist unter dem Text.
- Pipeline: eine Spalte (Verlauf, dann Einordnung); ein Verlaufseintrag steht zweizeilig (Datum und Art, darunter der Text), eine offene Aufgabe als Kästchen und Text mit der Frist darunter.
- Die Fußleiste klebt unten und hat zwei Knöpfe; kein Statustext.
- Das `Modal` hat am Handy 16 statt 24 px Polster (QS-068, eigener PR); die klebende Fußleiste ist `<ModalFuss>` und braucht kein Maß von Hand.

### Die Admin-Detailseite `/admin/speaker/[id]`

Die Seite bekommt **denselben Kopf und dieselben Blöcke**, nur als Karten (`Block karte`, `ebene="h2"`) und mit `PageHeader` statt Fensterkopf. Heute sind es zehn Karten in drei Gruppen („Wirkt sofort“, „Der Entwurf“, „Nur lesen“), zwei Spalten; die Übersicht „Auf dieser Seite“ hat zehn Einträge.

| Heute (Karte) | Morgen |
|---|---|
| Status, Betreuung (Handlungsband „Wirkt sofort“) | Kopf: Hauptaktion, *Weitere Aktionen* (Betreuung, Stand ändern, Einladung erneut, Absage), Stufenleiste, Kontextzeile |
| Stammdaten, Interne Notiz | Block **Grunddaten** |
| Einordnung, Verlauf | Block **Pipeline** |
| Einwilligungen (lesend), Portalzugang, „Mails gehen an …“ (Partner verwaltet) | Block **Onboarding** |
| Biografien, Links & Technik | Block **Profil** — nur Admin, zugeklappt (das pflegt der Speaker selbst) |
| Pass & Hospitality, An- & Abreise | Block **Hospitality** |
| Sessions | Block **Programm** |

- „Auf dieser Seite“ (`AbschnittsNavigation`) zählt nur noch die Blöcke, die es im Stand gibt — vor der Zusage zwei, danach fünf bis sechs statt zehn. Ein Sprung auf `#hospitality` öffnet den Block (im Baustein).
- Die Zweiteilung „Entwurf / Nur lesen“ löst sich auf: Ein Block enthält Felder **und** Lesendes (Hospitality: Felder und An-/Abreise des Speakers). Dafür ist die Reihenfolge dieselbe wie im Fenster — wer das Fenster kennt, kennt die Seite.
- Eine klebende Leiste „Änderungen speichern · Verwerfen“ erscheint **nur, wenn es Ungespeichertes gibt** (Archetyp B, wie heute), und `useUngesichert` warnt beim Verlassen.
- **Admin-Vollständigkeit:** die Seite ist die Obermenge des Fensters (Profil, Einwilligungen, Portalzugang kommen dazu); kein Feld des Fensters fehlt im Admin.

### Verhalten

1. **Stand-Aktionen schließen das Fenster nicht** (wie heute `report()` mit Toast und `router.refresh()`); Kopf, Leiste und Blöcke zeigen den neuen Stand. Nach „Hat bestätigt“ erscheinen die drei Blöcke, Onboarding öffnet sich, die Hauptaktion heißt nun „Einladung ins Portal schicken“ und behält den Fokus. Der Toast sagt, was passiert ist (`confirmedMoved`).
2. **„Änderungen speichern“ speichert den Entwurf und schließt das Fenster** (wie heute, LEAD-026). Weil in zugeklappten Blöcken Änderungen unsichtbar sein können, fragt *Schließen* und Escape bei Ungespeichertem mit `ConfirmDialog` („Änderungen verwerfen?“).
3. **Pflichtfelder in einem zugeklappten Block** öffnen ihn von selbst, wenn die Prüfung des Browsers sie bemängelt (im Baustein; sonst bliebe das Formular ohne Meldung stehen).
4. **Der Zustand offen/zu wird nicht gemerkt:** jedes Öffnen beginnt mit der Vorgabe nach Stand, damit das Fenster bei jedem Kontakt dasselbe sagt.
5. **Fehler** bleiben im Fenster (`Modal error`, ADM-062), nie als Toast.
6. **Während eine Aktion läuft** zeigt die Hauptaktion `loading`, und die übrigen Aktionen sind gesperrt (`pending`, wie heute); das Menü schließt sich beim Wählen (Verhalten des Bausteins).

### Zuordnung auf Bausteine

| Zweck | Baustein | Neu? |
|---|---|---|
| Fenster, Ränder | `Modal size="wide"`, `ConfirmDialog` | nein |
| Person | `PortraitShape size="sm"`, `Badge` | nein |
| Hauptaktion, Nebenaktionen | `Button` (primär / `secondary` / `ghost`), `ButtonLink` | nein |
| „Weitere Aktionen“ | `Menu` mit **`ton="hell"`**, `MenuItem`, `MenuSeparator` | **erweitert** (Rand, Hover-Fläche, Pfeil; die Vorgabe `navy` bleibt) |
| Wo steht der Speaker im Ablauf | **`Stufenleiste`** | **neu** |
| Aufklappbarer Abschnitt mit Marke und Kurzfassung | **`Block`** (`<details>`, `ebene` Pflicht, `karte`) | **neu** |
| Frist | `FristMarke kompakt` | nein |
| Schreibgeschützte Einordnung | `InfoList` mit **`schmal`** | **erweitert** (9 statt 14 rem) |
| Felder | `Field`, `Input`, `Textarea`, `Select`, `Checkbox` | nein |
| Seite (Admin) | `PageHeader`, `AbschnittsNavigation`, `Block karte` | nein |

### Texte (neu, DE / EN)

Vorhandene Texte bleiben (`confirmAction`, `duty_*`, `dutiesDone`, `invite`, `inviteAgain`, `handover`, `confirmedMoved`, `pipelineLockedHint`). Neu im Wörterbuch des Bereichs:

| Schlüssel (Vorschlag) | DE | EN |
|---|---|---|
| `blockBasics` · `blockPipeline` · `blockOnboarding` · `blockHospitality` · `blockProgramme` | Grunddaten · Pipeline · Onboarding · Hospitality · Programm | Basics · Pipeline · Onboarding · Hospitality · Programme |
| `markNext` · `markOpen` · `markOpenN` · `markDone` | Nächste Pflicht · Offen · Offen · {n} · Erledigt | Next required · Open · Open · {n} · Done |
| `stageLabel` · `stageCounter` · `nextLabel` | Stand · Schritt {n} von {m} · Als Nächstes | Stage · Step {n} of {m} · Next |
| `moreActions` · `changeStage` · `declineMenu` | Weitere Aktionen · Stand ändern … · Hat abgesagt … | More actions · Change stage … · Has declined … |
| `actionContact` · `actionHospitality` · `actionTravel` · `actionSession` | Als kontaktiert markieren · Hospitality festlegen · Reisekosten freigeben · Im Programmboard zuordnen | Mark as contacted · Set hospitality · Approve travel expenses · Assign on the programme board |
| `saveChanges` · `discardTitle` · `discardBody` | Änderungen speichern · Änderungen verwerfen? · Was du geändert hast, geht verloren. | Save changes · Discard changes? · What you changed will be lost. |

### Was gebaut ist (dieser PR) und was nicht

- **Gebaut:** `components/ui/Stufenleiste.tsx` und `components/ui/Block.tsx` (neu, im Kit-Index; `Block` ist ein Client-Baustein, weil er auf Anker und auf die Prüfung des Browsers hört), `Menu ton` und `InfoList schmal` (rückwärtskompatibel: die Vorgaben verhalten sich wie vorher). Tests `tests/stufenleiste.test.ts` (11) und `tests/block.test.ts` (16, darunter die Übersetzung aller neuen Klassen durch Tailwind); Gegenproben gelaufen. Kontrast: gefüllte Stücke 4,88:1 und 5,33:1 auf Weiß (Grafik, Soll 3), „Abgesagt“ 5,72:1, Rand des hellen Menü-Auslösers 3,49:1.
- **Nicht gebaut:** der Umbau des Fensters und der Admin-Seite — er gehört dem Speaker-Chat (Rechte, Texte, Daten). Vorschlag für die Reihenfolge, damit jeder Review klein bleibt: **1.** Kopf (Hauptaktion, Menü, Stufenleiste, Aktionspanel; ersetzt Zusage-Karte, Pflichten-Karte und Stand-Knöpfe), **2.** die Blöcke (Inhalt umziehen, Marken aus `naechstePflichten`), **3.** Admin-Detailseite angleichen.
- **Side Events:** ADM-077/SPK-091 lösen den Haken „Reception“ ab. Bis dahin steht der Haken in Hospitality (`reception_eligible`); danach entfällt er, und die Liste der Side Events steht im Block Programm (Einladung mit Status eingeladen / zugesagt / abgesagt, „Einladen“ als Nebenaktion). Wird die Liste lang, wird daraus ein eigener Block — `Block` kostet nichts.

### Fragen

**An den Speaker-Chat**

1. **„Tier“ in LEAD-053:** Im Code gibt es `prio` (A/B/C, „Tier wie 2026“, LEAD-039) und `hotel_tier` (Hotel-Kategorie, Team). LEAD-053 nennt „Tier“ als sichtbar und „die Prio der Programmleitung“ als unsichtbar. Meint Tier die A/B/C-Einstufung? Dann ist das Badge im Kopf der Platz dafür; ist `prio` die interne Bewertung, entfällt es für den Stage Lead — der Entwurf verträgt beides.
2. Dürfen **Stage Leads die Grunddaten bearbeiten** (Rolle, Jobtitel, Organisation, Foto, Notiz)? Heute ja. LEAD-053 spricht von „nur pipeline-relevanten Feldern“; ohne Bearbeitungsrecht entfällt der Block für sie.
3. **Abgesagt nach der Zusage:** Bleiben Onboarding, Hospitality und Programm sichtbar, wenn `confirmed_at` gesetzt ist (es ist noch aufzuräumen: Session freigeben, Hotel stornieren)? Vorschlag: ja.
4. **Side Events** im Block Programm oder als eigener Block (siehe oben)?

**An Konrad**

1. Gefällt der Aufbau — Kopf mit **einer** Hauptaktion und der Stufenleiste, darunter fünf Blöcke, die Reihenfolge fest und nur das Passende offen?
2. „Änderungen speichern“ als **zweitrangiger** Knopf (Umriss), damit die Stand-Aktion der auffälligste Knopf ist — einverstanden?
3. Am Handy **Aufklappen** statt Reiter?

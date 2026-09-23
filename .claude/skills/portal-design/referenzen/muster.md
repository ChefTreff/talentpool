# Muster

Jedes Muster hat ein Vorbild im Repo. Erst das Vorbild lesen, dann bauen.

Woher die Bausteine kommen und wie ein Website-Block zu einem Portal-Baustein wird, steht in `referenzen/website-bloecke.md` — Aufbau, Maße und Übersetzung je Block.

## Seite

Vorbild: `app/(partner)/partner/page.tsx`.

```tsx
<>
  <PageHeader
    eyebrow={t.x.eyebrow}          // optional, Versalien, 12/16
    title={t.x.title}              // genau ein H1 pro Seite
    description={t.x.lead}         // ein Satz, max. 800 px breit
    actions={<Button>{t.x.cta}</Button>}   // genau eine primäre Aktion
  />
  {/* Inhalt in Karten, linksbündig, 8-pt-Abstände */}
</>
```

Reihenfolge im Bereich: Shell (`SidebarShell` mit `area` und `width`) → `PageHeader` → Statuszeile/Kennzahlen → Arbeitsbereich → Sekundäres. Die Seite lädt serverseitig, prüft mit `requireArea(...)` und holt alle Beschriftungen über `getI18n` und `loadVocabMap` — kein hartcodierter Text.

## Kennzahlen und Fortschritt

`StatCard` (`label`, `value`, `hint`). Dashboards zeigen den Stand als Satz plus Zahl: „3 von 5 erledigt", Frist mit Countdown, Ansprechpartner-Karte. Fortschritt nie nur als Balken — die Zahl steht daneben.

## Formular

```tsx
<form className="max-w-[640px] space-y-6">
  <Field label={t.f.name} htmlFor="name" hint={t.f.nameHint} required requiredLabel={t.f.req}>
    <Input id="name" name="name" />
  </Field>
  <Field label={t.f.rolle} htmlFor="rolle" error={fehler.rolle}>
    <Select id="rolle" options={rollen} placeholder={t.f.waehlen} invalid={!!fehler.rolle} />
  </Field>
  <div className="flex gap-2">
    <Button type="submit">{t.f.speichern}</Button>
    <Button variant="ghost" type="button">{t.f.abbrechen}</Button>
  </div>
</form>
```

Label über dem Feld, Hilfetext darunter, Fehler am Feld (nicht im Toast), Pflicht mit „*" **und** Wort im Label. Feldhöhe 40, Radius 8, Fokusring 2 px Akzent. Keine Platzhalter als Ersatz für Labels.

## Tabelle

Vorbild: `components/ui/Table.tsx`, Einsatz in den Admin-Bereichen.

- Kein Zebra. Dünne `border-border`-Linien, sticky Header, Hover `bg-surface-hover`.
- Zahlen rechts: `<Th numeric>` / `<Td numeric>` (`tabular-nums` liegt global auf `body`).
- Zeilenhöhe 44, Bedienelemente in Zeilen `size="sm"`.
- Breite Tabellen gehören in einen `overflow-x-auto`-Container, die Seite scrollt nie horizontal.
- Filterleiste oben, Zustand in der URL, damit ein Link denselben Ausschnitt zeigt.
- Status als `<Badge>` mit Wortlaut, nie als farbiger Punkt allein.

## Zustände

| Zustand | Mittel |
|---|---|
| leer | `<EmptyState title description action>` — ein Satz, eine Aktion |
| lädt | `<Button loading>` bzw. ruhige Skelettfläche in `bg-surface-hover`; kein Spinner-Vollbild |
| Fehler im Formular | `Field error` |
| Ergebnis einer Aktion | `useToast()` — kurz, sachlich, kein Ausrufezeichen |
| gefährlich | `<ConfirmDialog>` mit Klartext, was passiert; Button `variant="destructive"` |

## Wizard

`<StepBar steps current srLabel onSelect>` über dem Inhalt, ein Schritt pro Seite, Fortschritt sichtbar, Rücksprung erlaubt, Zwischenstand speichern. Vorbild: `/partner/onboarding` (Archetyp C).

Die Marker sind Sechsecke auf einer durchgehenden Linie — waagerecht ab 640 px, darunter senkrecht, genau wie die Website es mobil umbricht (Step Section `54:9522`). `<Stepper>` bleibt als Knopfreihe im Kit für enge Stellen, in denen keine Linie hinpasst; für einen Ablauf ist `StepBar` das Muster.

## Dialoge

`<Modal label onCancel>` für Entscheidungen, `<Drawer open onClose title footer>` für Detail- und Bearbeitungsansichten. Beide nutzen natives `<dialog showModal>` — Fokusfalle, Escape und Inertisierung kommen vom Browser. Nichts davon nachbauen.

## Sidebar, Bereichsname und Fuss

`SidebarShell`: Navy-Seitenleiste, oben links Bereichsname („CHEFTREFF SPEAKER PORTAL"), Gruppen *Übersicht · Profil/Unternehmen · Summit · Formate · Support*. Wer nur einen Bereich hat, sieht keine Spur der anderen — kein Umschalter, keine Links, nichts im HTML (Feedback-Runde 1, Punkt 2).

**Den Fuss zieht die Shell, nicht die Seite.** `SidebarShell` rendert `PortalFooter` selbst: Rollen-Postfach des Bereichs (`mailboxFor`), Impressum und Datenschutz auf die Hauptwebsite. Keine Seite setzt ihn noch einmal — vorher taten es zwei von 94, und die Pflichtangaben fehlten auf dem Rest. Ein eigenes Postfach gibt die Seite über `mailbox` mit.

**Breiten kommen aus Tokens, nie als rohe Werte.** `max-w-content` (1200) ist der Normalfall, `max-w-table` (1400) für dichte Admin-Listen — beides setzt die Shell über `width`. Für Text- und Formularspalten innerhalb einer Seite: `max-w-text` (800) und `max-w-form` (640). Fehlt ein Mass, kommt es als Token nach `globals.css`, nicht als `max-w-[900px]` in eine Seite.

**`width="table"` gilt dem Bereich, nicht der Seite** — und deshalb nur dort, wo **fast alle** Seiten Tabellen sind. Im Admin wurde es probiert und wieder verworfen: 35 der 41 Seiten setzen gar keine eigene Breite, `width="table"` haette also auch jedes Formular und jede Kartenliste auf 1400 gezogen. Eine dichte Tabelle in einem 1200er Rahmen scrollt in ihrem eigenen `overflow-x-auto`-Container; das ist der kleinere Preis. Wer eine einzelne Seite wirklich breiter braucht, aendert nicht das Layout des ganzen Bereichs.

**Die Porträt-Form gilt für Personen, nicht für Bedienelemente.** `PortraitShape` (gekipptes Dreieck) trägt jede Personen-Darstellung ab 56 px — `PersonCard`, `ContactCard`, Listen, Jury, Team. Der Avatar im Profilmenü bleibt rund: er ist bei 24 px der Auslöser eines Menüs, kein Porträt, und ein Dreieck in dieser Grösse ist nur noch ein Fleck.

**Lange Seiten sagen, woraus sie bestehen** (QS-026). Ab etwa vier Abschnitten bekommt eine Seite eine `AbschnittsNavigation` oben; jeder Abschnitt traegt einen Anker (`<Card id>` oder `<Sektion id>`), und die Seitenleiste spiegelt dieselbe Liste als eingerueckte Unterpunkte. **Die Seite benennt ihre Abschnitte selbst** — nicht automatisch aus den Ueberschriften gelesen, denn die Uebersicht soll die wichtigen zeigen, nicht alle. Zustandsmeldungen („nicht berechtigt“, „abgelehnt“) gehoeren nicht hinein. **Wizards bekommen keine**: dort fuehrt die `StepBar`, und zwei Fortschrittsanzeigen nebeneinander widersprechen sich. **Seiten mit gestuften Bedingungen auch nicht** — im Hackathon haengt jeder Abschnitt am vorigen (`accepted`, dann `accepted && team`, dann `accepted && team && challenge`); eine feste Liste zeigte dort auf Anker, die je nach Stand gar nicht im Dokument stehen. Ein Sprungziel, das ins Leere fuehrt, ist schlechter als keine Übersicht.

**Dateien waehlt man mit `FileButton`, nie mit einem rohen `<input type="file">`.** Das rohe Feld zeichnet der Browser selbst: es sieht auf jedem System anders aus, heisst mal „Datei auswaehlen“ und mal „Durchsuchen“, und man erkennt nicht, dass dort etwas hochgeladen wird (QS-025). Auswaehlen und Hochladen sind **zwei** Schritte — wer die falsche Datei erwischt, soll es vor dem Hochladen sehen.

**Die Sprache waehlt man ueberall gleich**, mit `LocaleSwitcher`: beide Sprachen nebeneinander, die aktive fett und unterstrichen. Eine Zeile, die nur die *andere* Sprache zeigt, verraet den Zustand nicht (QS-024). Der Baustein steht in der Shell und gilt damit fuer alle Portale; einzelne Seiten bauen ihn nicht nach.

**Das Hero-Band steht auf jeder Startseite** (Konrad, 17.09.). Es traegt den Titel, deshalb steht darunter **kein** `PageHeader` mehr — zwei Ueberschriften uebereinander waren genau der Fehler, den es vermeidet. Leerzustaende (kein Profil, keine Organisation) behalten den schlichten Kopf: ein Marken-Band ueber einer Fehlmeldung ist Prunk.

## Login, Welcome, Marketing-Moment

Die einzigen Stellen, an denen die Marke laut auftritt:

- Navy-Grund (`#081A35`), zentriert, Dreiecks-/Linienkomposition dahinter. Formen-Gradient laut CI: 110°, Fill-Opacity 60 %, Stops 0 % → Akzent mit 0 % Opacity, 100 % → Akzent voll. Nie hinter Text.
- Höchstens **ein** `.ct-laica`-Halbsatz als Eyebrow.
- Eine Aktion. Kein zweiter CTA, keine Feature-Liste, keine Logo-Wand.

**Highlight-Regel** (steht in den CI-Vorgaben ausdrücklich als „Regel für Claude/KI"): In der Hero-Section jeder Seite wird **ein** Schlüsselwort im Titel hervorgehoben —

1. Schnitt: Sharp Sans Display No1 **Extrabold Italic**; der Rest des Titels bleibt Extrabold, nicht kursiv.
2. Farbe des Highlight-Worts auf der Website: die Events-Akzentfarbe. **Im Portal das Highlight-Pink** (`text-highlight`) — der Akzent trägt auf Navy keinen Text (3,56:1), Pink erreicht 8,0:1 (Entscheidung 14.09.2026).
3. Restlicher Titel: `#F5F4F2`.
4. Hintergrund: Navy.
5. Textcase: **UPPERCASE** für die ganze Headline.
6. Das Highlight-Wort ist typischerweise das letzte Wort oder ein Aktionswort („forward", „wachsen", „starten").

Beispiel: „THREE WAYS WE'LL PUSH YOU *FORWARD*". Im Code: `.ct-highlight`.

Sobald der Nutzer angemeldet ist, hört das auf: Arbeitsflächen sind hell, linksbündig, ruhig.

## Vorbilder von der Website (FLS27)

Quellen: Website-Design `node-id=201-432` (Desktop und Mobil nebeneinander) und die CI-Vorgaben `node-id=201-4`, beide gelesen am 12.09.2026.

**Erster Grundsatz: die Website ist dunkel, das Portal ist hell.** Übernommen werden Bausteine und Rhythmus, nicht die Navy-Fläche. Und: die Website ist noch mit dem alten Akzent `#6D6DEF` gesetzt — **keine Hex-Werte von dort kopieren**, es gilt der Token.

Direkt übertragbar:

| Muster von der Website | Einsatz im Portal |
|---|---|
| **Sektionsrhythmus**: Laica-Kursiv-Eyebrow („What to expect") → Extrabold-Versalien-Headline → Fließtext → **eine** Aktion | Login, Welcome, Landing. Im Arbeitsbereich derselbe Rhythmus, aber Eyebrow als `.ct-eyebrow` (Versalien, SB) statt Laica |
| **Personen-Karte**: rundes Foto mit Akzent-Ring, Name Extrabold Versalien, Rolle als gefüllter Akzent-Chip, Organisation darunter | Speaker-, Mentoren-, Jury- und Team-Listen. Im Portal die Rolle in Sharp Sans SB statt Laica — Laica nur auf Marketing-Seiten |
| **Zitat-Karte**: 1 px Akzentrahmen, Zitat, darunter Hexagon-Bullet + Name (Versalien) + Rolle | Referenzen, Feedback-Zitate, Erfolgsmeldungen im Welcome |
| **Akkordeon**: 1 px Akzentrahmen, Label SB Versalien links, Chevron rechts, geöffnet mit Fließtext | FAQ und Hilfe in jedem Bereich. Umsetzung mit `<details>/<summary>` oder Button + `aria-expanded` — nie mit reinem CSS-Trick |
| **Merkmalsleiste** auf Akzentfläche mit Hexagon-Bullets („Exklusive Events · Job-Plattform · Updates") | `NextStepBanner` auf Startseiten, Welcome, Leerzustände. **Weisser Text auf der Akzentfläche, nicht Navy** — Navy erreicht dort nur 3,56:1 (gemessen 17.09.2026), Weiss 4,88:1 |
| **Footer**: dünne Trennlinie, Logo + Kontakt links, Linkreihe, Copyright | Portal-Footer mit Impressum, Datenschutz, Support-Adresse |
| **Karussell mit Punkten** | nur für gleichrangige Inhalte, nie automatisch laufend, nie für Arbeitsdaten. Im Zweifel Liste statt Karussell |

**CTA-Farbe:** Die Website setzt ihre Hauptaktion in Pink `#FF88CF` mit Navy-Text (8,0:1) — „Zu den Events", „Join our community". Das ist der Aktionsmarker der Marke, im Brandbook unter HIGHLIGHTS geführt. Im Portal gilt: **Marketing-Moment ja, Arbeitsfläche nein.** Login, Welcome und der Bewerbungs-CTA dürfen Pink tragen; Formular-, Tabellen- und Dialogbuttons bleiben Akzent, sonst schreit jede Speichern-Aktion.

**Hero-Highlight:** Auf der Website läuft das Highlight-Wort („OWN YOUR *FUTURE*") in einem Verlauf von Violett nach Türkis — ein Dachmarken-Moment über alle drei Divisionen. Im Portal bleibt `.ct-highlight` einfarbig, und zwar im **Highlight-Pink** auf Navy (8,0:1); der Akzent selbst trägt dort keinen Text.

Nicht übernehmen: Navy als Arbeitsfläche, zentrierte Fließtexte, Fotobänder, Logo-Wände, ganzseitige Verläufe, Bilder als Sektionstrenner.

## Vorbilder aus dem Team-Portal (`team.chef-treff.de`)

Gelesen am 17.09.2026 im Walkthrough mit Konrad (er eingeloggt, Design-Session nur lesend). Das Team-Portal ist die zweite Quelle für alles, was die Website nicht hat: Listen mit Aktionen, Filter, Formulare, Navigationstiefe. Es ist ein Arbeitswerkzeug, das seit Monaten benutzt wird — und darin liegt sein Wert.

**Was direkt übernommen wird:**

| Muster im Team-Portal | Im Portal |
|---|---|
| **Gruppenkopf mit Zählung**, rechts die primäre Aktion: „PASSWÖRTER · 15" ─ [Neues Passwort] | genau so. Die Zahl im Kopf beantwortet „wie viele" ohne Scrollen |
| **Suchfeld über der Liste**, volle Breite, Platzhalter nennt die durchsuchten Felder („Suchen — Name, Benutzername, Notiz") | ab etwa 15 Einträgen. Der Platzhalter sagt, wonach gesucht wird — sonst rät man |
| **Filter als Chip-Reihe**: „Alle · 14" gefüllt, die übrigen als Soft-Chips | Filterleiste über Tabellen und Listen, Zustand in der URL |
| **Zeile mit mehreren Aktionen**: eine gefüllt (die häufigste), der Rest Umriss — „Kopieren · Anzeigen · Bearbeiten · Löschen" | genau so. Eine Zeile darf mehrere Aktionen tragen, aber nur **eine** sieht aus wie die Hauptsache |
| **Erledigtes klappt zusammen**: „▸ ERLEDIGT · 3" als `<details>` unter der laufenden Liste | Checklisten, Bestellungen, Einreichungen. Was fertig ist, ist Nachschlagewerk |
| **Auswahl-Zeilen statt Dropdown**: „Ich habe bezahlt / Mit der Firmenkarte / Rechnung an ChefTreff", je mit Erklärzeile, gruppiert unter kleinen Überschriften | Wizard-Einstiege und Formularverzweigungen. Ein Dropdown versteckt die Erklärung, die man genau dort braucht |
| **Erklärkasten oben auf Detailseiten**: Soft-Fläche, drei Sätze — was diese Daten sind, wer sie ändert, wie man eine Änderung meldet | Detailseiten mit Feldern, die man nicht selbst ändern darf |
| **Nur-Lesen-Feld als Label über Wert mit Grundlinie**, kein Rahmen | so sehen unveränderliche Angaben wie Angaben aus, nicht wie Fließtext |
| **Reiter mit Unterstrich** im Inhalt **und** als eingerückte Unterpunkte in der Seitenleiste | tiefe Bereiche (Profil, Passwörter). Beides zeigt dasselbe — wer über die Leiste kommt, findet sich in den Reitern wieder |
| **Sektions-Eyebrow plus ein erklärender Satz** vor jedem Abschnitt | überall. Der Satz ist keine Zierde: er beantwortet „was mache ich hier" |
| **Segmented Control** für zwei Sichten desselben Inhalts: „Ich | Team" | Listen mit Perspektivwechsel |

**Dichte:** Zeilen im Team-Portal sind höher als unsere 44 px (etwa 62 px bei Zeilen mit Aktionsknöpfen). Das ist kein Widerspruch — 44 gilt für Datenzeilen ohne Bedienelemente; sobald Knöpfe darin stehen, braucht die Zeile die Höhe eines Bedienelements plus Abstand.

**Zwei Unterschiede, die nicht übernommen werden, bis Konrad sie entscheidet:**

1. **Die Seitenleiste des Team-Portals ist hell**, nicht Navy — aktiver Punkt als Soft-Fläche mit Akzenttext. Unsere Leiste ist Navy (`QS-001`, `QS-007`, beide gebaut). Offen.
2. **Knöpfe und Chips sind dort Pillen**, bei uns 8-px-Rechtecke (Design-Briefing §5: eine Form konsequent). Offen.

## Sprache

Du/ihr. Buttons benennen das Ergebnis. Fehler nennen den nächsten Schritt („Frist abgelaufen — melde dich bei …" statt „Ungültige Eingabe"). Jeder Begriff, den Nutzer sehen, kommt aus `vocab_term` bzw. `getI18n`, DE und EN gleichwertig.

---

## Bildschirm-Archetypen (ab 14.09.2026)

Der Komponentenkatalog sagt, **womit** gebaut wird. Diese Archetypen sagen, **wie eine Seite aussieht**. Sie sind der Grund, warum die Portale bis dahin uneinheitlich wirkten: jede Seite wurde einzeln erfunden, statt eine Ausprägung zu sein.

Konrads Maßstab (Feedback-Runde 2): *„immer nah am täglichen Arbeiten der Nutzer"* — Vorbild sind Werkzeuge wie Asana, nicht Marketingseiten.

### A · Liste (Leitmuster, umgesetzt in `/partner/checkliste`)

Für alles Zählbare: Aufgaben, Bestellungen, Einreichungen, Teilnehmende.

**Zeilen, keine Kartenwand.** Eine Karte je Eintrag sieht großzügig aus und wird ab dem fünften Eintrag unlesbar — man sieht nicht mehr, dass es eine Liste ist.

```
┌ Gruppenkopf ── Titel · Kennung ─────────────── „3 von 8" ┐  ← Trennlinie darunter
│ ○  Aufgabe                              02.04.2027  [Offen]│
│ ●  Erledigte Aufgabe                    12.03.2027  [Fertig]│  ← Titel ruhiger
│┃○ Überfällige Aufgabe                   01.03.2027  [Offen]│  ← Balken links
└──────────────────────────────────────────────────────────┘
```

- **Spalte 1: Zustand als Kreis.** Gefüllt mit Häkchen = erledigt, leerer Ring = offen. Form **und** Farbe, nie Farbe allein.
- **Spalte 2: die Sache selbst**, als Knopf mit `aria-expanded`. Anklicken klappt die Details auf — höchstens eine Zeile gleichzeitig.
- **Spalte 3: die Frist**, rechtsbündig, `tabular-nums`, ab 640 px sichtbar. Überfällig in `text-error-ink` und halbfett.
- **Spalte 4: Status als `<Badge>`** mit Wortlaut.
- **Überfällige Zeile** trägt links einen 2-px-Balken in `border-l-error-ink` und `bg-error-soft/40`.
- **Details beim Aufklappen** auf `bg-canvas`, eingerückt unter die Sache: links Beschreibung und Verlauf, rechts die Aktion.
- Die ganze Liste sitzt in **einer** `<Card className="p-0">`, die Zeilen trennt `border-b`.

**Warum Aufklappen:** Alles gleichzeitig zu zeigen war der Fehler davor. Eine Checkliste beantwortet zuerst „was ist offen und bis wann" — der Rest ist Nachschlagen.

### B · Detail (umgesetzt in `/admin/speaker/[id]`)

Für einen einzelnen Datensatz mit vielen Feldern: Speaker, Person, Organisation, Bestellung, Session.

Das Problem eines Detailblatts ist nie der Platz, sondern die **Gleichrangigkeit**: dreissig Felder in acht Karten sehen alle gleich wichtig aus, und die zwei Dinge, wegen derer man die Seite geöffnet hat, gehen darin unter.

```
┌ Rücklink · Name · Rolle · Organisation ──────── [Status] [Typ] ┐  ← Kopfzeile
├────────────────────────────────────────────────────────────────┤
│ Was sofort wirkt: Status setzen · Betreuung · Einladen          │  ← Handlungsband
├──────────────────────────────────┬─────────────────────────────┤
│ Der Entwurf (ein Speichern):     │ Nur lesen:                   │
│ Grunddaten · Bio · Links ·       │ Reise · Sessions · Verlauf   │
│ Hospitality · Notizen            │ Ansprechpartner              │
└──────────────────────────────────┴─────────────────────────────┘
                         [ Speichern ]  ← klebt unten, solange es Änderungen gibt
```

- **Kopfzeile** statt `HeroBand`: ein Detailblatt ist kein Bereichseinstieg. Name als `.ct-h1`, darunter die Einordnung, rechts die Statuschips.
- **Handlungsband** direkt darunter: alles, was **sofort** wirkt und protokolliert wird (Status, Zuständigkeit, Einladung, Freigabe). Diese Dinge haben kein „Speichern" — sie passieren beim Klick, und deshalb dürfen sie nicht zwischen Formularfeldern stehen.
- **Zwei Spalten ab 1024 px:** links der **Entwurf** (alles, was sich ein gemeinsames „Speichern" teilt), rechts das **Nur-Lesen** (was von woanders kommt). Mobil untereinander, Entwurf zuerst.
- **Der Speichern-Balken klebt unten** und erscheint nur, wenn es Ungespeichertes gibt. Ein dauerhaft sichtbarer Knopf, der nichts zu tun hat, ist eine Einladung zum Leerklicken.
- Leere Felder bleiben sichtbar mit „—" (`common.none`): dass etwas **nicht** gepflegt ist, ist auch eine Auskunft.

### C · Formular (umgesetzt in `/partner/onboarding`)

Für alles, was ausgefüllt wird: Onboarding, Anmeldung, Einreichung, Profil.

```
┌ Kopf: Titel · ein Satz ─────────────────────────────────────┐
│ ①─────②─────③─────④     ← StepBar, waagerecht (mobil senkrecht)
├─────────────────────────────────────────────────────────────┤
│ Schritt 3 von 4 · Logo                                       │
│ ┌ Feld ─────────────┐ ┌ Feld ─────────────┐                 │  max. 640 breit
│ │ Label             │ │ Label             │                 │
│ └───────────────────┘ └───────────────────┘                 │
│ [ Zurück ]  [ Weiter ]              Zwischenstand gesichert  │
└─────────────────────────────────────────────────────────────┘
   Noch offen: Rechnungsadresse · Beschreibung        ← was fehlt, steht unten
```

- **Ein Schritt pro Bildschirm**, `StepBar` darüber. Der Fortschritt kommt aus dem **Inhalt** (`done`), nicht aus der Position — wer vorspringt, bekommt keinen Haken geschenkt.
- **Formularspalte 640**, zweispaltig nur für Felder, die zusammengehören (PLZ und Ort). Label über dem Feld, Hilfetext darunter, Fehler **am Feld**.
- **Zurück und Weiter unten links**, in dieser Reihenfolge. „Weiter" speichert. Ein eigener „Speichern"-Knopf steht daneben, damit man mittendrin aufhören kann.
- **Was noch fehlt, steht am Ende der Seite** als Aufzählung, nicht als Fehlermeldung. Es ist kein Fehler, dass ein Formular noch nicht fertig ist.
- Nach dem Abschluss wird dieselbe Seite zum **Profil**: gleiche Felder, kein Wizard, `StepBar` zeigt alles erledigt.

### D · Übersicht (umgesetzt in `/partner`)

Die Startseite eines Bereichs. Beantwortet in dieser Reihenfolge: **Wo bin ich · Was ist zu tun · Wie steht es · Wen frage ich.**

```
┌ HeroBand ── Bereich · Titel mit Highlight · ein Satz ── [Kennzahl] ┐  Navy
├────────────────────────────────────────────────────────────────────┤
│ NextStepBanner ── „3 von 8 Aufgaben offen"          [ Zur Liste ]  │  Akzent
├──────────────┬──────────────┬──────────────┬───────────────────────┤
│ StatCard     │ StatCard     │ StatCard     │ StatCard              │  4 Zahlen
├──────────────┴──────────────┴──────────────┴───────────────────────┤
│ Nächste Fristen (DateRow-Liste)   │ Ansprechpartner (PersonCard)   │
│ Bestellte Leistungen              │ Zeiten und Anfahrt             │
└────────────────────────────────────────────────────────────────────┘
                                                        PortalFooter
```

- **Genau ein `HeroBand` und höchstens ein `NextStepBanner`.** Zwei Akzentflächen übertönen sich.
- **Höchstens vier Kennzahlen.** Was nicht in vier Zahlen passt, ist keine Übersicht.
- **Fristen als `DateRow`-Liste**, nicht als Absatz mit Datum darin. Datum links in fester Spalte, Sache in der Mitte, Zustand rechts.
- **Keine Karte ohne Inhalt:** ein Abschnitt, zu dem nichts gepflegt ist, fällt weg. Eine leere Überschrift ist schlechter als nichts.
- Der Fuss trägt `PortalFooter` — Support-Postfach und Rechtstexte, sonst nichts.

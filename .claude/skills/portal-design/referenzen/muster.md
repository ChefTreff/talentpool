# Muster

Jedes Muster hat ein Vorbild im Repo. Erst das Vorbild lesen, dann bauen.

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

Reihenfolge im Bereich: Shell (`AreaShell` mit `area` und `width`) → `PageHeader` → Statuszeile/Kennzahlen → Arbeitsbereich → Sekundäres. Die Seite lädt serverseitig, prüft mit `requireArea(...)` und holt alle Beschriftungen über `getI18n` und `loadVocabMap` — kein hartcodierter Text.

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

`<Stepper steps current srLabel>` über dem Inhalt, ein Schritt pro Seite, Fortschritt sichtbar, Rücksprung erlaubt, Zwischenstand speichern. Vorbild: Talent-Onboarding.

## Dialoge

`<Modal label onCancel>` für Entscheidungen, `<Drawer open onClose title footer>` für Detail- und Bearbeitungsansichten. Beide nutzen natives `<dialog showModal>` — Fokusfalle, Escape und Inertisierung kommen vom Browser. Nichts davon nachbauen.

## Sidebar und Bereichsname

`SidebarShell` / `AreaShell`: Navy-Seitenleiste, oben links Bereichsname („CHEFTREFF SPEAKER PORTAL"), Gruppen *Übersicht · Profil/Unternehmen · Summit · Formate · Support*. Wer nur einen Bereich hat, sieht keine Spur der anderen — kein Umschalter, keine Links, nichts im HTML (Feedback-Runde 1, Punkt 2).

## Login, Welcome, Marketing-Moment

Die einzigen Stellen, an denen die Marke laut auftritt:

- Navy-Grund (`#081A35`), zentriert, Dreiecks-/Linienkomposition dahinter. Formen-Gradient laut CI: 110°, Fill-Opacity 60 %, Stops 0 % → Akzent mit 0 % Opacity, 100 % → Akzent voll. Nie hinter Text.
- Höchstens **ein** `.ct-laica`-Halbsatz als Eyebrow.
- Eine Aktion. Kein zweiter CTA, keine Feature-Liste, keine Logo-Wand.

**Highlight-Regel** (steht in den CI-Vorgaben ausdrücklich als „Regel für Claude/KI"): In der Hero-Section jeder Seite wird **ein** Schlüsselwort im Titel hervorgehoben —

1. Schnitt: Sharp Sans Display No1 **Extrabold Italic**; der Rest des Titels bleibt Extrabold, nicht kursiv.
2. Farbe des Highlight-Worts: die Events-Akzentfarbe.
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
| **Merkmalsleiste** auf Akzentfläche mit Hexagon-Bullets („Exklusive Events · Job-Plattform · Updates") | Welcome und Leerzustände; Navy-Text auf Akzent, nie weiß |
| **Footer**: dünne Trennlinie, Logo + Kontakt links, Linkreihe, Copyright | Portal-Footer mit Impressum, Datenschutz, Support-Adresse |
| **Karussell mit Punkten** | nur für gleichrangige Inhalte, nie automatisch laufend, nie für Arbeitsdaten. Im Zweifel Liste statt Karussell |

**CTA-Farbe:** Die Website setzt ihre Hauptaktion in Pink `#FF88CF` mit Navy-Text (8,0:1) — „Zu den Events", „Join our community". Das ist der Aktionsmarker der Marke, im Brandbook unter HIGHLIGHTS geführt. Im Portal gilt: **Marketing-Moment ja, Arbeitsfläche nein.** Login, Welcome und der Bewerbungs-CTA dürfen Pink tragen; Formular-, Tabellen- und Dialogbuttons bleiben Akzent, sonst schreit jede Speichern-Aktion.

**Hero-Highlight:** Auf der Website läuft das Highlight-Wort („OWN YOUR *FUTURE*") in einem Verlauf von Violett nach Türkis — ein Dachmarken-Moment über alle drei Divisionen. Im Portal bleibt `.ct-highlight` einfarbig im Akzent.

Nicht übernehmen: Navy als Arbeitsfläche, zentrierte Fließtexte, Fotobänder, Logo-Wände, ganzseitige Verläufe, Bilder als Sektionstrenner.

## Sprache

Du/ihr. Buttons benennen das Ergebnis. Fehler nennen den nächsten Schritt („Frist abgelaufen — melde dich bei …" statt „Ungültige Eingabe"). Jeder Begriff, den Nutzer sehen, kommt aus `vocab_term` bzw. `getI18n`, DE und EN gleichwertig.

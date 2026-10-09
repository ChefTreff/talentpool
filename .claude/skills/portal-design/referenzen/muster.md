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

**Kontrollkästchen und Optionsfelder bekommen die Markenfarbe von `globals.css`** (QS-060: eine Regel in `@layer base`, `accent-color: accent-strong`). Kein `accent-…` von Hand an einem Kästchen; sonst malt der Browser Systemblau neben dem Violett der Knöpfe. **Die Trefferfläche eines Kontrollkästchens ist seine Beschriftung** (QS-065 (7)): Das Kästchen misst 20 px, angetippt wird der Streifen drumherum, und der stand in den rund 70 Stellen bei 20 bis 28 px. Am Handy sind es jetzt 44, am Desktop bleibt die Zeile dicht. Neue Stellen nehmen `<Checkbox label hint>` (Kästchen an der ersten Zeile, auch wenn die Beschriftung umbricht; gesperrt in Grau); steht die Beschriftung woanders — über dem Feld in einem `<Field label htmlFor>` oder als Kopf einer Tabellenspalte —, nimmt man `<Checkbox id />` bzw. `<Checkbox aria-label />` ohne `label`: eine Fläche von 44 × 44, die mit `-m-3` über das Kästchen hinausragt, das Layout misst weiter 20 px. Von Hand gebaute Zeilen (`<label className="flex items-center gap-2 …">`) bekommen die 44 px aus einer Basisregel in `globals.css`: jedes `<label>` mit Kästchen oder Optionsfeld ist auf groben Zeigern mindestens 44 hoch (`min-height`, damit mehrzeilige Einwilligungstexte nicht noch wachsen). Eine ausdrückliche feste Höhe darunter (`min-h-10`) gewinnt gegen die Basisregel und braucht `pointer-coarse:min-h-11`. Bekannte Grenze: eine einzeilige Beschriftung in einer von Hand gebauten `items-start`-Zeile sitzt in der 44-px-Fläche oben; die Komponente zentriert sie über den Innenabstand. **Wörterbuchtexte sind reiner Text** (QS-061): kein `**fett**`, keine Backticks — sie stünden wörtlich in der Oberfläche; der Test `markenfarbe-woerterbuch` prüft es.

**Mehrere Einträge wählen** (SPK-051, PART-128): Eine Frage zeigt nie alle Kästchen auf einmal, wenn es mehr als etwa fünf sind — die drei Fragen „Wen wünscht ihr euch?“ der Company Tour (27 Kästchen) standen am Handy 1064 px hoch (gemessen 08.10.2026), für Angaben, die man meist offen lässt. **Eine kurze Liste, die zu einer Frage gehört** (Status, Berufserfahrung, Studienrichtung; bis etwa zwölf Einträge): `<MehrfachAuswahl aufklappbar leer={…} />` in einem `<Field label htmlFor={id}>` — zugeklappt eine Zeile so hoch wie ein Eingabefeld, die sagt, was gewählt ist (ab zwei Einträgen mit der Zahl; nichts gewählt zeigt den Text aus `leer`, z. B. „Offen für alle“), ein Klick öffnet die Kästchen im Fluss der Seite (kein Popover: ein Schubfach oder Dialog schneidet sie nie ab, am Handy liegt kein Scrollbereich im Scrollbereich). Nichts gewählt ist der häufigste Fall und der Wortlaut sagt, was er bedeutet („Offen für alle“, nicht „Keine Auswahl“). **Eine lange Liste** (Themen, Skills): `<MehrfachAuswahl>` mit Suche und Marken über dem Feld. Die aufklappbare Fassung gibt die Wahl immer in der Reihenfolge der Liste zurück, damit „abgewählt und wieder gewählt“ in einem Formular, das Listen vergleicht, keine Änderung ist. Die Galerie `/design` zeigt beide Zustände.

**Ungesicherte Änderungen** (QS-051): Lange Formulare mit Entwurf (Profil, Reise, Daten, Inhalte) warnen vor dem Verlassen — `const warnung = useUngesichert(geaendert, t.common.unsaved)` und `{warnung}` im Formular rendern. „Geändert“ heisst: anders als der **zuletzt gespeicherte** Stand (`basis` neben `entwurf`), nicht anders als die Server-Daten — der Server normalisiert, und eine eben gespeicherte Eingabe sähe sonst geändert aus. Neuladen und Tab schliessen fragt der Browser, Links im Portal der Kit-`ConfirmDialog`; der Zurück-Knopf bleibt ungefragt (der App Router bietet keine Sperre). Knöpfe in Dialogen tragen `type="button"`, sonst schicken sie ein umgebendes Formular ab.

Label über dem Feld, Hilfetext darunter, Fehler am Feld (nicht im Toast), Pflicht mit „*" **und** Wort im Label. Feldhöhe 40, Radius 8, Fokusring 2 px Akzent. Keine Platzhalter als Ersatz für Labels.

## Tabelle

Vorbild: `components/ui/Table.tsx`, Einsatz in den Admin-Bereichen.

**Tabellen mit Aktionen in der letzten Spalte stapeln am Handy** (QS-058): `<Table stapeln>` und je Zelle `<Td label="…">`. Unter 640 px werden die Zeilen zu Blöcken — Name oben ohne Beschriftung, darunter die beschrifteten Zellen, zuletzt die Aktionen —, die Kopfzeile bleibt für Vorlesegeräte. Davor lag „Bearbeiten“ bei den Kontakten 730 px, bei der Gästeliste 979 px rechts außerhalb des Bildes (gemessen bei 375 px); eine festgehaltene erste Spalte hätte daran nichts geändert. Ab 640 px bleibt es die Tabelle, gemessen unverändert. Zellen ohne `label` stehen ohne Beschriftung da (richtig für Name und Aktionen), leere Zellen entfallen. Die Regeln stehen in `globals.css` (`.ct-stapeln`) und bewusst ohne Ebene, weil sie Zeilenhöhe und Polster der Zellen schlagen müssen. Wo eine Zeile aufklappt (rohes `<tr><td colSpan>`), gilt dasselbe.

**Eine Spalte ohne Überschrift (die mit den Aktionen) trägt ihren Namen am Kopf:** `<Th aria-label={t.colAction} />` (QS-077, 09.10.2026). `Th` gibt `aria-label` an die Zelle weiter; davor verwarf es ihn still, und an 18 Stellen blieb der Kopf für Vorlesesoftware leer. Wo der Name sichtbar sein soll, steht er als Text im Kopf. Ein Test hält die Weitergabe fest und die Liste der fünf Köpfe, die noch ohne Namen sind (`<Th />`, Admin: Gerüst und Leads) — ein sechster kommt nicht dazu.

**Ein Editor, der unter einer Liste aufklappt, kommt beim Öffnen ins Bild** (QS-066): `useEditorImBild(entwurf, id)` aus dem Kit — `aufmachen()` vor dem Setzen des Entwurfs, `<Card id="…">` am Editor; die Seite springt (ohne Animation) und der Fokus geht ins erste Feld. Im Produktstamm und bei den Vorlagen stand der Editor hinter der Tabelle: wer in sechzig Zeilen „Bearbeiten“ drückte, sah nichts. Wo der Editor nicht die ganze Breite braucht, ist ein `Drawer` der bessere Weg (Wiki, Initiativen) — dann entfällt das Problem.

**Knöpfe in Zeilen und Touch-Ziele** (QS-057): Auf groben Zeigern sind Kit-Knöpfe und -Felder 44 px hoch. Eine Zeile mit Bedienelementen ist 56 hoch und springt dadurch nicht; in einer gewöhnlichen 44-px-Zeile wüchse sie mit einem 44-px-Knopf nur um den 1 px breiten Zeilenrand (gemessen 44 → 45 px, nur am Handy). **Die Zeile erkennt ihre Bedienelemente selbst** (QS-065, 02.10.2026): `Tr` trägt eine `:has()`-Regel für Knopf, Auswahl, Textfeld, jedes Feld außer dem versteckten (auch Kontrollkästchen und Optionsfeld) und `ButtonLink`/`ButtonDownload` (die tragen `data-knopf`); ein Textlink zählt nicht. Davor galt die Regel nur dort, wo jemand `controls` setzte — 28 Zeilen mit Knopf oder Feld standen bei 44, 10 bei 56. Wer Knöpfe in Zeilen setzt, tut nichts weiter; `controls` bleibt für das, was CSS nicht sieht. **Der Name einer Zeile, der etwas öffnet, ist das Ziel der ganzen Zelle** (QS-064 (2), `.ct-ziel`): ein Textknopf von 20 px in einer 56-px-Zeile trifft man am Handy nicht. Die Zelle ist `relative` (`<Td className="relative">`), der Knopf trägt `className="ct-link ct-ziel text-left"`; eine Fläche über der Zelle (`::after`, `inset: 0`) macht sie zum Ziel, die Hover-Fläche der Zeile zeigt es an. Dasselbe in einer Liste: das `<li>` ist `relative` (am Handy mit `pointer-coarse:py-3` mindestens 44), der Name der Anker. Ohne `relative` im Elternelement deckte die Fläche die ganze Seite — ein Test zählt nach. Tabellen mit solchen Zeilen stapeln unter 640 px (`<Table stapeln>`, jede Zelle außer dem Namen mit `label`), gestapelte Zellen nehmen die volle Breite (`max-width: none`). **Ausnahme `<Tr dicht>`** nur für Arbeitstabellen, in denen die Zeile das Bearbeitungsfeld ist (Programm, Regie: sechs bis zwölf Felder je Zeile, hunderte Zeilen) — dort bleibt die Zeile bei 44. Ein Test hält die Liste der Ausnahmen fest; eine dritte entscheidet Konrad, nicht die Seite.

**Eine lange Arbeitstabelle gruppiert, wenn man sie nach einem Merkmal liest** (ADM-069, Programm nach Bühne und Tag): ein `<tbody>` je Gruppe, darin eine Kopfzeile `<tr><th scope="rowgroup" colSpan>` als Band (`bg-accent-soft`, Linien oben und unten in `border-border-strong`, Name als `<h2 className="ct-h2">`, rechts daneben die Zahlen: wie viele Zeilen, wie viele noch offen). Die Spalten, die die Gruppe schon sagt, entfallen; die Sortierung der Spalten gilt **innerhalb** der Gruppen (`gruppiereSlots` in `components/programme/gruppen.ts` ist die reine Funktion, ein Test hält die Reihenfolge fest). Das Band klebt links (`sticky left-0`, am Handy höchstens `max-w-72`), damit der Name bei seitlichem Scrollen im Bild bleibt, und ein Schalter („Nach … gruppieren“, `?gruppe=aus`) bringt die flache Liste zurück. Die Linie zwischen zwei Zeilen einer Arbeitstabelle steht in `border-border-strong/60` und die Zellen haben `py-1`: mit der Standardlinie gingen die Feldränder der 40-px-Felder in der 44-px-Zeile mit ihr zusammen. Namen in Chips brechen nie in sich um (`whitespace-nowrap`), umbrochen wird zwischen den Namen.

**Ein Kalender trennt aufeinanderfolgende Karten sichtbar** (ADM-069): vier Pixel Abstand unter der Karte (`SLOT_ABSTAND`) — bei zwei Pixeln flossen drei Final-Slots in einer Farbe zu einem Block —, die Stundenlinie in `border-border-strong/40`, die halbe Stunde gestrichelt in `border-border`, und eine helle Fläche (Soll: `accent-soft`) bekommt einen Rand rundherum (`ring-1 ring-inset ring-accent/30`), weil sie sonst mit dem weißen Grund zusammenläuft.

- Kein Zebra. Dünne `border-border`-Linien, sticky Header, Hover `bg-surface-hover`.
- Zahlen rechts: `<Th numeric>` / `<Td numeric>` (`tabular-nums` liegt global auf `body`).
- Zeilenhöhe 44, Bedienelemente in Zeilen `size="sm"`.
- Breite Tabellen gehören in einen `overflow-x-auto`-Container, die Seite scrollt nie horizontal.
- Filterleiste oben, Zustand in der URL, damit ein Link denselben Ausschnitt zeigt — über `useUrlFilter` (`components/ui`, QS-050): lesbare Werte statt IDs (Slug, Datum, Vokabel-Schlüssel), Suche als `q`, Sortierung als Spalte mit „-“ für absteigend, Schalter als `1`; nur, was von der Vorgabe abweicht, steht in der Adresse. Geschrieben wird per `history.replaceState`, ohne Server-Rundlauf.
- Status als `<Badge>` mit Wortlaut, nie als farbiger Punkt allein.

## Zustände

| Zustand | Mittel |
|---|---|
| leer | `<EmptyState title description action>` — ein Satz, eine Aktion |
| lädt | `<Button loading>` bzw. ruhige Skelettfläche in `bg-surface-hover`; kein Spinner-Vollbild |
| Fehler im Formular | `Field error` |
| Ergebnis einer Aktion | `useToast()` — kurz, sachlich, kein Ausrufezeichen |
| gefährlich | `<ConfirmDialog>` mit Klartext, was passiert; Button `variant="destructive"` |
| Hinweis oder Warnung auf einer Fläche | `<Card className="border-accent-soft bg-accent-soft">` (Hinweis) bzw. `border-warning-soft bg-warning-soft` (Warnung); der Text trägt den dunklen Ton derselben Familie (`text-accent-deep` 5,65 : 1, `text-warning-ink` 5,13 : 1). Die Tönung wirkt seit QS-073 an jeder Karte (`kartenFlaeche`) — vorher blieb `bg-accent-soft` an einer `Card` weiß; ein rohes `<div>` dafür ist nicht mehr nötig. Der Rand gehört zur Tönung |
| Seite fällt aus | `error.tsx` je Bereich → `<Fehlergrenze>` (`components/fehler/`), Baustein `<ErrorState>`: was passiert ist, Fehler-ID, „Neu laden“ als einzige primäre Aktion, Weg zur Startseite. Nie die Meldung des Fehlers zeigen, nur `fehlerId(error)` (QS-023). Neue Bereiche bekommen ihre `error.tsx` mit — `tests/fehlergrenzen.test.ts` prüft es |

## Wizard

`<StepBar steps current srLabel onSelect>` über dem Inhalt, ein Schritt pro Seite, Fortschritt sichtbar, Rücksprung erlaubt, Zwischenstand speichern. Vorbild: der Reisekostenantrag der Speaker (Archetyp C). **Nur für echte Abläufe, in denen die Reihenfolge stimmt.** Sind die Teile unabhängig — man kann die Rechnungsdaten vor der Beschreibung ausfüllen —, ist es **kein Wizard**, sondern Abschnitte mit Stand (Archetyp C′, `/partner/onboarding`): die Linie las „Schritt 4 erledigt, Schritt 3 fehlt“ als Fehler (PART-106).

Die Marker sind Sechsecke auf einer durchgehenden Linie — waagerecht ab 640 px, darunter senkrecht, genau wie die Website es mobil umbricht (Step Section `54:9522`). `<Stepper>` bleibt als Knopfreihe im Kit für enge Stellen, in denen keine Linie hinpasst; für einen Ablauf ist `StepBar` das Muster.

## Dialoge

`<Modal label onCancel>` für Entscheidungen, `<Drawer open onClose title footer>` für Detail- und Bearbeitungsansichten. Beide nutzen natives `<dialog showModal>` — Fokusfalle, Escape und Inertisierung kommen vom Browser. Nichts davon nachbauen.

**Das Polster eines `Modal` ist am Handy 16 px, ab 640 px 24** (QS-068). Was gegen das Polster arbeitet, nimmt beide Maße: die klebende Fußleiste eines langen Fensters ist `<ModalFuss>` (letztes Kind des `Modal`), die Meldung zur Aktion `error` am `Modal` — nie `-mx-6 -mb-6 -bottom-6` von Hand, das reichte am Handy 8 px über den Rand und machte das Fenster seitlich scrollbar (ein Test zählt nach). **Die Meldung steht im Fuß, über den Knöpfen** — wie beim Drawer über dem Fuß: Hat das Fenster einen `ModalFuss`, zeigt er sie, und das `Modal` lässt seine eigene Leiste weg; ohne Fuß klebt sie als Leiste bündig am unteren Rand. Beides zugleich gibt es nie (zwei am Rand klebende Streifen deckten die Knöpfe zu; bei 375 px gemessen 85 px). Die Meldung also immer als `error` am `Modal` übergeben, nie als eigenen Absatz im Fenster.

## Sidebar, Bereichsname und Fuss

`SidebarShell`: Navy-Seitenleiste, oben links Bereichsname („CHEFTREFF SPEAKER PORTAL"), Gruppen *Home (erste Gruppe ohne Kopf, QS-076) · Profil/Unternehmen · Summit · Formate · Support*. Wer nur einen Bereich hat, sieht keine Spur der anderen — kein Umschalter, keine Links, nichts im HTML (Feedback-Runde 1, Punkt 2).

**Den Fuss zieht die Shell, nicht die Seite.** `SidebarShell` rendert `PortalFooter` selbst: Rollen-Postfach des Bereichs (`mailboxFor`), Impressum und Datenschutz auf die Hauptwebsite. Keine Seite setzt ihn noch einmal — vorher taten es zwei von 94, und die Pflichtangaben fehlten auf dem Rest. Ein eigenes Postfach gibt die Seite über `mailbox` mit.

**Wechselt ein Bereich über die Adresszeile (`?bereich=dateien`), sind es Reiter, keine Knopfreihe** (QS-059): `SectionTabs` mit `aktiv` an jedem Eintrag — `usePathname()` kennt die Abfrage nicht, die Seite weiß es. Eine Reihe aus `ButtonLink` (`secondary` für den aktuellen, `ghost` für die übrigen) sah in Medien und Dubletten anders aus als alle anderen Verwaltungsseiten und machte den aktuellen Bereich zum Knopf.

**Eine Event-Seite beginnt mit den Eckdaten und einer Stand-Karte** (HACK-013, Vorschlag 04.10.2026, `docs/design-vorschlaege-2026-10-04.md`; Vorbild: die Event-Seite von Luma, nur im Aufbau): unter dem `HeroBand` zuerst `Eckdaten` (Wann, Wo), dann **eine** `NextStepBanner` mit dem Stand und genau einer Aktion, danach die Karten. Am Desktop steht links eine schmale Seitenspalte (Ansprechperson als `ContactCard`, Zahlen, Discord), am Handy folgt sie der Hauptspalte. Namen und Fotos anderer Teilnehmender gehören nicht in diese Seite (Datenminimierung). Ohne Angabe fehlt die Eckdaten-Zeile — es steht nichts Erfundenes da.

**Filter, Tagwahl und Bereichswahl innerhalb einer Seite sind `Chip` oder `ChipLink`** (QS-064, 04.10.2026). Die Klassenfolge stand in sieben Dateien (Programmansicht und Fotos im Talent-Portal, Fotos im Admin, Messeshop, Hackathon-Challenges, Stage-Lead-Pipeline), überall bei 32 px, auch am Handy; jetzt 32 am Desktop, 44 am Handy. `Chip` ist ein `<button>` (der Zustand liegt im Client, `aria-pressed` kommt aus `aktiv`), `ChipLink` ein Link (der Zustand liegt in der Adresse, `aria-current="page"` kommt aus `aktiv`). Eine Gruppe steht in `<div role="group" aria-label>` bzw. `<nav aria-label>` mit `flex flex-wrap gap-1`. Eine Statusanzeige ist kein Chip, sondern ein `Badge` (nicht klickbar); die Reiter eines Admin-Bereichs (`SectionTabs`) bauen auf `ChipLink` auf. Die zwei Links der Kopfzeile auf Navy sehen ähnlich aus, tragen aber Navy-Farben und bleiben eigene Klassen; ein Test hält die Liste der Stellen fest.

**Der Testbetrieb-Hinweis sitzt in der Shell, einmal** (QS-056 c, ab 02.10.2026): `TestbetriebHinweis`, ein schmaler Streifen unter der Kopfzeile in `warning-soft`/`warning-ink` (5,1:1), `role="note"`. Er sagt, womit man spielen darf — Daten mit `ZZTEST` sind Testdaten, alles andere ist echt. **Eine Zeile, kein Overlay, nichts zum Wegklicken:** am Handy steht nur der Kernsatz (`kurz`), der zweite Satz (`mehr`) erst ab `md`. Eine Seite baut ihn nie selbst ein — sonst stünden zwei Streifen untereinander, und die zentrale Abschaltung (`NEXT_PUBLIC_TESTBETRIEB_HINWEIS=false` zum Go-live, `lib/testbetrieb.ts`) liefe an ihr vorbei. Der Einlass hat bewusst keine Shell und zeigt ihn nicht. Dasselbe Muster taugt für jeden anderen Umgebungshinweis: ein Streifen in der Shell, ein Schalter, kein zweites Banner in einer Seite.

**Breiten kommen aus Tokens, nie als rohe Werte.** `max-w-content` (1200) ist der Normalfall, `max-w-table` (1400) für dichte Admin-Listen — beides setzt die Shell über `width`. Für Text- und Formularspalten innerhalb einer Seite: `max-w-text` (800) und `max-w-form` (640). Fehlt ein Mass, kommt es als Token nach `globals.css`, nicht als `max-w-[900px]` in eine Seite.

**Karten: Liste oder Tabelle bis zum Rand ist `<Card className="p-0">`** (QS-055). Das wirkt seit 01.10.2026 wirklich — vorher blieb jede Karte bei 24 px, weil `cn` Klassen nur aneinanderfügt und im erzeugten CSS `p-6` hinter `p-0` steht (gleiche Ursache wie `feldBreite` bei Feldern). `p-4` ist die kompakte Karte, `px-…`/`py-…` und Varianten (`sm:p-8`) gingen schon immer. Eine randlose Karte beschneidet ihren Inhalt an der Rundung (`overflow-hidden`), die Zeilen darin tragen ihr eigenes `px-4 py-2.5`. **`Table` bringt Rahmen und Scrollen selbst mit** — keine Karte darum legen, das gibt einen doppelten Rand. **Allgemeine Falle:** Überschreibt ein `className` eine Eigenschaft, die der Baustein selbst setzt (Padding, Höhe, Farbe), gewinnt der **größere Zahlenwert**, nicht die spätere Klasse. Wo das gebraucht wird, löst der Baustein es selbst (`kartenPadding`, `feldBreite`); `tailwind-merge` in `cn` wäre die Gesamtlösung (Vorschlag an die Architektur-Session).

**`width="table"` gilt dem Bereich, nicht der Seite** — und deshalb nur dort, wo **fast alle** Seiten Tabellen sind. Im Admin wurde es probiert und wieder verworfen: 35 der 41 Seiten setzen gar keine eigene Breite, `width="table"` haette also auch jedes Formular und jede Kartenliste auf 1400 gezogen. Eine dichte Tabelle in einem 1200er Rahmen scrollt in ihrem eigenen `overflow-x-auto`-Container; das ist der kleinere Preis. Wer eine einzelne Seite wirklich breiter braucht, aendert nicht das Layout des ganzen Bereichs.

**Die Porträt-Form gilt für Personen, nicht für Bedienelemente.** `PortraitShape` (gekipptes Dreieck) trägt jede Personen-Darstellung ab 56 px — `PersonCard`, `ContactCard`, Listen, Jury, Team. Der Avatar im Profilmenü bleibt rund: er ist bei 24 px der Auslöser eines Menüs, kein Porträt, und ein Dreieck in dieser Grösse ist nur noch ein Fleck. **Das Bild füllt einen Rahmen, es positioniert sich nie selbst** (TAL-016): ein `<img>` mit `absolute` und Abständen nimmt seine eigene Höhe an (Preflight: `height: auto`) und ragt bei Hochformat aus der Form — der Rahmen misst die Form, das Bild ist `size-full object-cover object-top` darin, beschnitten wird der Rahmen. Probe immer mit einem freigestellten Hochformat-PNG, einem Querformat und einem kleinen Bild.

**Fotos von Personen schneidet man zu, bevor sie hochgeladen werden** (ADM-066, Konrad 02.10.: „die Bilder sitzen komisch“). Das Dreieck der Porträt-Form wird nach oben schmal: ein Hochformat sitzt darin anders als ein Selfie, und ein Gesicht im oberen Drittel wird abgeschnitten. `BildZuschnitt` zeigt **dieselbe Form über dem Bild** (außerhalb abgedunkelt), lässt ziehen, zoomen und mit Pfeil- und Plustasten bedienen und gibt eine fertige Datei heraus — WebP bis 2000 px ohne Metadaten (Safari: JPEG). Er lädt **nichts** hoch; das tut der Aufrufer mit seinen Rechten, wie bisher. So wird er eingesetzt (Talent-Porträt, Speaker-Foto, Ansprechperson im Admin, Foto eines Gastes):

```tsx
const [zuschnitt, setZuschnitt] = useState<File | null>(null);
// Dateiwahl: Typ und Größe wie bisher prüfen, dann nicht hochladen, sondern zuschneiden lassen.
onFile={(file) => { /* Prüfung */ setZuschnitt(file); }}
{zuschnitt && (
  <BildZuschnitt datei={zuschnitt} onAbbruch={() => setZuschnitt(null)}
    onFertig={(fertig) => { setZuschnitt(null); void hochladen(fertig); }} />
)}
```

Die Texte kommen aus `ZuschnittTexteGeber` (Wurzel-Layout und Shell, in der Sprache des Bereichs), der Dialog braucht sie nicht als Eigenschaft. `form="quadrat"` gilt für alles, was kein Gesicht ist. Steht die Dateiwahl in einem `Drawer`, öffnet sich der Dialog darüber — zwei modale `<dialog>` stapeln im Top-Layer. Wer das Bild in einer **eigenen Fläche** zeichnet (Grafik mit Rahmen, Maske), nimmt `useBildAusschnitt(datei, kante, { zeichneUeber })`: Laden, Lage, Zeichnen, Ziehen, Pinch, Mausrad und Tasten stecken darin (`canvasProps`, `regler`, `ausschnitt()`); die Geste nie nachbauen — der Pinch rechnete einmal mit dem neuen statt dem alten Abstand und tat nichts. Probe immer mit einem Hochformat, einem Querformat und einem kleinen Bild, am Handy mit Touch-Emulation, und mit dem fertigen Foto im Portal, nicht nur im Dialog.

**Lange Seiten sagen, woraus sie bestehen** (QS-026). **Die Übersicht ist ein Menü, und man sieht es ihr an** (QS-042, Konrad 24.09.: „sofort als Menü erkennbar — der erste visuelle Anker der Seite"): Akzent-Soft-Fläche direkt unter dem Seitenkopf, weisse Knöpfe mit Pfeil nach unten, Beschriftung `common.onThisPage`. Sie steht auf jeder Seite mit drei oder mehr Abschnitten, die länger als ein Bildschirm ist. Nicht auf Startseiten, die haben das Band und die Einstiege. Und nicht, wo sich dieselben Abschnitte je Objekt wiederholen (Interview Tables je Tisch), denn doppelte Anker springen ins Falsche. Die Übersicht steht oben; jeder Abschnitt traegt einen Anker (`<Card id>` oder `<Sektion id>`), und die Seitenleiste spiegelt dieselbe Liste als eingerueckte Unterpunkte. **Die Seite benennt ihre Abschnitte selbst** — nicht automatisch aus den Ueberschriften gelesen, denn die Uebersicht soll die wichtigen zeigen, nicht alle. Zustandsmeldungen („nicht berechtigt“, „abgelehnt“) gehoeren nicht hinein. **Wizards bekommen keine**: dort fuehrt die `StepBar`, und zwei Fortschrittsanzeigen nebeneinander widersprechen sich. **Seiten mit gestuften Bedingungen auch nicht** — im Hackathon haengt jeder Abschnitt am vorigen (`accepted`, dann `accepted && team`, dann `accepted && team && challenge`); eine feste Liste zeigte dort auf Anker, die je nach Stand gar nicht im Dokument stehen. Ein Sprungziel, das ins Leere fuehrt, ist schlechter als keine Übersicht.

**Dateien waehlt man mit `FileButton`, nie mit einem rohen `<input type="file">`.** Das rohe Feld zeichnet der Browser selbst: es sieht auf jedem System anders aus, heisst mal „Datei auswaehlen“ und mal „Durchsuchen“, und man erkennt nicht, dass dort etwas hochgeladen wird (QS-025). Auswaehlen und Hochladen sind **zwei** Schritte — wer die falsche Datei erwischt, soll es vor dem Hochladen sehen. **Ausnahme Einzelbild** (TAL-017): Für ein Porträt oder Foto lädt die Auswahl sofort hoch — `<FileButton sofort laedt={busy} …>`; dort ist die falsche Datei billig (das Bild steht gleich daneben, Ersetzen ist ein Klick). Der Zwischenzustand „lädt hoch“ ist der Ring im Knopf, Fehler kommen als Toast. Bei **Fotos von Personen** ruft `sofort` zwar `onFile` gleich auf, aber das öffnet den Zuschnitt (ADM-066, oben); hochgeladen wird erst der Ausschnitt. Dokumente (Lebenslauf, Präsentation, Beleg) bleiben bei zwei Schritten.

**Die Sprache waehlt man ueberall gleich**, mit `LocaleSwitcher`: beide Sprachen nebeneinander, die aktive fett und unterstrichen. Eine Zeile, die nur die *andere* Sprache zeigt, verraet den Zustand nicht (QS-024). Der Baustein steht in der Shell und gilt damit fuer alle Portale; einzelne Seiten bauen ihn nicht nach.

**Das Hero-Band steht auf jeder Startseite** (Konrad, 17.09.). Es traegt den Titel, deshalb steht darunter **kein** `PageHeader` mehr — zwei Ueberschriften uebereinander waren genau der Fehler, den es vermeidet. Leerzustaende (kein Profil, keine Organisation) behalten den schlichten Kopf: ein Marken-Band ueber einer Fehlmeldung ist Prunk.

**Drei Ebenen in der Leiste** (QS-045, ab 24.09.2026, alle Portale): Gruppenköpfe als `.ct-eyebrow` in `text-accent-soft` mit Trennlinie darüber · Punkte in `text-on-navy`, unter einem Gruppenkopf eingerückt (`pl-4`) · der aktive Punkt als helle Pille (`bg-on-navy text-shell-ink`) · die Abschnitte der Seite als dritte Ebene, `.ct-help` mit Linie links. Köpfe und Punkte im selben Grau, wie bis dahin, las Konrad als „unübersichtlich".

**Der Admin im Kontrastton Lila** (QS-046): Die Leiste trägt `data-shell-ton="admin"`, und `globals.css` stellt darin die Variablen um: Grund `--ct-shell` auf `accent-deep`, Hilfstext `--ct-on-navy-muted` auf `accent-soft` (das Grau von Navy käme dort nur auf 2,9:1). Keine Komponente muss davon wissen. Oben steht im Admin nur „Admin-Portal", die Portale stehen unten als offene Liste „Portale" mit Pfeil zurück, an der Stelle, an der in den Portalen der Weg in den Admin steht. **Was eine Rolle sieht, bleibt Sache von `lib/admin-sections.ts`** (Admin-Chat), die Shell ändert nur die Darstellung.

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
| **Sektionsrhythmus**: Laica-Kursiv-Eyebrow („What to expect") → Extrabold-Versalien-Headline → Fließtext → **eine** Aktion | Login, Welcome, Landing — und **seit QS-037 (24.09.2026) jede Unterseite**: `PageHeader word` setzt das Laica-Wort im Akzent über den Titel. Vorher stand im Arbeitsbereich eine Versalienzeile statt Laica; Konrad hat die Kursive der Talent-Startseite ausdrücklich als Vorbild genannt |
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

## Fristen am Abschnitt (QS-044, ab 24.09.2026)

Eine Frist, die zu einem Abschnitt gehört, steht **rechts in dessen Kopfzeile** als `FristMarke`, nicht als Hilfezeile darunter und nicht als eigene Karte weiter unten (Konrad, 24.09.: „deutlich größer, farblich hervorgehoben, rechtsbündig in der Zeile des Sektionskopfs"). Das Datum steht in `.ct-h2` und ist damit so groß wie der Titel daneben. Die Fläche folgt dem Stand, immer mit einem Wort dazu: offen (Akzent) · bald, unter sieben Tagen (gelb) · vorbei (rot) · erledigt (grün).

```tsx
<div className="flex flex-wrap items-start justify-between gap-3">
  <h2 className="ct-h2 text-ink">{titel}</h2>
  <FristMarke className="ml-auto" dueAt={iso} dateText={…} vorbei={…} erledigt={…} t={…} />
</div>
```

- Das Datum formatiert der Server **mit `timeZone: "Europe/Berlin"`**, denn er läuft in UTC.
- Kennt der Server den Stand (`late_now`, angenommene Datei), gibt die Seite `vorbei` oder `erledigt` mit. Sonst rechnet der Browser nach dem Laden.
- Ist die Aufgabe angenommen, fällt die Marke weg: dann sagt das Badge alles.
- Die große, laufende Zahl (`DeadlineCard prominent`) bleibt der Ticketseite vorbehalten. Dort ist die Frist das Thema der Seite (PART-066).

**Die kompakte Marke ist am Handy eine Zeile** (PART-094): unter 640 px „Deadline 19.03.2027“, bei bald, vorbei und erledigt statt des Worts der Stand („noch 3 Tage“, „vorbei“, „erledigt“) — die Restzeit einer offenen Frist („noch 168 Tage“) trägt dort nichts. Davor brach sie auf 375 px auf drei Zeilen um, acht Zeilen der Checkliste trugen acht gleiche Marken von rund 40 px (jetzt 24 px). Ab 640 px bleibt die volle Fassung. Farbe und Wort bleiben (Regel 4).

## Links in ein neues Fenster (QS-034, ab 24.09.2026)

Jeder Link, der das Portal verlässt, öffnet ein neues Fenster (Konrad, 23.09.: *„generell sollen global immer alle Tabs die nach extern leiten im neuen Tab geöffnet werden"*). Nie von Hand, immer über den Helfer:

```tsx
import { neuesFenster } from "@/components/ui/neues-fenster";

<a href={url} className="ct-link" {...neuesFenster}>…</a>
<ButtonLink href={url} {...neuesFenster}>…</ButtonLink>
```

Er setzt `target="_blank"`, `rel="noopener noreferrer"` und `aria-describedby` auf die **eine** Ansage „öffnet ein neues Fenster" im Root-Layout. Ein Link mit eigenem Hinweis im `aria-label` würde doppelt vorgelesen. Dasselbe gilt für eigene Seiten, die bewusst in einem neuen Fenster aufgehen (Druckansicht der Regie).

**Nicht** für Downloads: die eigene `.ics`, signierte Adressen mit `download: true`. Dort bliebe ein leeres Fenster zurück, solche Links tragen `download`. `tests/externe-links.test.ts` lässt neue Verstöße auffallen: `target="_blank"` von Hand, feste `https://`-Adressen ohne Helfer, Adressen aus Daten (`…Url`, `…_url`) ohne Helfer oder `download`, `window.open` ohne `noopener`.

## Wiki: Themen, Liste oder Artikel (PART-058, ab 02.10.2026)

`components/wiki/WikiView.tsx`, ein Baustein für alle Portale und die Vorschau im Admin.

- **Themen statt Phasen.** Die Liste ist nach Aufgaben gruppiert (Summit & Anreise · Stand & Aufbau · Vor Ort · Programm & Formate · Sichtbarkeit & Marketing · Speaking · Hackathon · Weitere Artikel), die Phase bleibt eine Marke am Artikel. In der Oberfläche heißt es **„Thema“**, nie „Kategorie“: Im Admin ist „Kategorie“ die Zielgruppe eines Artikels. Die Zuordnung steht bis zum Datenfeld in `lib/wiki/kategorien.ts` (Slug → Thema, ein gesetztes `category` am Artikel gewinnt); neue Artikel erscheinen sofort unter „Weitere Artikel“.
- **Am Handy Liste oder Artikel, nie übereinander.** Der Artikel ersetzt die Liste, „Alle Artikel“ führt zurück, und der **Fokus folgt** (auf den Titel, beim Zurück auf den zuletzt gelesenen Eintrag). Ab 1024 px stehen beide nebeneinander, der erste Eintrag ist offen. Ein hervorgehobener erster Eintrag in der Handyliste täuschte eine Auswahl vor und fällt dort weg.
- **Die Adresse ist die Kennung des Artikels** (`#slug`, so verlinkt der Assistent), ein Abschnitt hängt dahinter (`#slug/abschnitt`). Nie einen Abschnitt als eigenen Anker setzen, sonst öffnet er keinen Artikel.
- **„Auf diesem Artikel“ ab vier Abschnitten** (`##`-Überschriften, Kennungen aus `abschnitte()` — dieselbe Quelle für Übersicht und Anker). Ab 1024 px die Kit-Übersicht offen, am Handy zugeklappt: neun Fragen untereinander schöben den Text unter den Bildschirmrand.
- **Der Artikel ist die Seite** (PART-104, 09.10.2026): sein Titel ist der Seitentitel (`h1` über Liste und Artikel, darüber das Laica-Wort „Wissen“), darunter Thema und Stand, dahinter die Marken (Phase, diese Edition, andere Sprache). „Wiki“ bleibt der Titel, solange am Handy die Liste steht. Der Titel hängt vom offenen Artikel ab — deshalb zeichnet `WikiView` den Kopf, nicht `WikiPage`; beide Köpfe stehen im Markup, einer per CSS ausgeblendet (`PageHeader` bekommt dafür `titleId`, `titleRef`, `titleLang`).
- **Überschriftenfolge:** Seitentitel `h1` (Artikeltitel; in der Handyliste „Wiki“) → verborgenes `h2` „Artikel nach Thema“ → Themen `h3`; im Artikel **Abschnitt (`##`) = `h2` in `ct-h2`** (18/24, Versalien) **mit einer Linie darüber** (40 px Abstand, der erste Block ohne), **Unterabschnitt (`###`) = `h3` in `ct-h3`** (16/24 halbfett), „Mehr zu …“ `h2` in `ct-h3`. Vorher war der Abschnitt so groß wie der Fließtext und der Unterabschnitt kleiner als er (18 → 16 → 16 → 14). Fließtext, Listen und Hinweiskästen laufen `max-w-text` breit, Tabellen nehmen ihre Breite. Die Antworten des Assistenten (`<Markdown kompakt>`) behalten die kleine Zuordnung: Versalien mit Linie gehören nicht in eine Sprechblase.
- **Der gewählte Artikel in der Liste** trägt einen Balken links in Akzent (`border-l-2 border-accent`, gegen den Seitengrund 4,4 : 1) auf weißer Fläche; vorher `bg-surface-hover` auf dem Seitengrund, 1,03 : 1. Die Trefferzahl der Suche ist eine Statusmeldung (`role="status"`).
- **Die Gliederung steht im Text als Gliederung, nicht als Fettdruck** (PART-104 Teil 2): `##` ist ein Abschnitt, `###` ein Unterabschnitt, tiefer nicht; die Überschrift ist eine Frage, wenn der Abschnitt eine beantwortet, sonst ein Substantiv oder eine kurze Wortgruppe — ohne Doppelpunkt am Ende, ohne Klammer, ohne Nummer in neuen Texten. Eine Zeile, die nur aus `**…**` besteht, sieht aus wie Betonung und gliedert nichts; der Editor weist darauf hin („Fette Zeile als Überschrift gemeint?“), `fetteUeberschrift()` in `markdown-parse.ts` ist die Regel (ein fetter Satz mit Punkt bleibt ein Hinweis), `tests/wiki-gliederung.test.ts` wacht über `content/wiki/*.md`, und die Hilfsfunktion `wiki_fette_zeilen_zu_ueberschriften` hat die Artikel in der Datenbank umgestellt.
- **Ein vom Server gebautes Element (der Assistent) steht in einem eigenen Element**, nicht lose zwischen den Geschwistern in der Kindliste eines Client-Bausteins: sonst warnt React mit „unique key“.

## Mehrere Instanzen: ein Umschalter, die Formulare einmal (QS-079, ab 09.10.2026)

Konrad 09.10.2026 (Partner › Masterclasses): „bitte global immer so handhaben“. Heute zeigt `/partner/masterclass` für jede der zwei Sessions vier Karten untereinander (Session, Inhalt, Goodies, Sprecher): jedes Formular doppelt, die Seite zwei Bildschirme lang, und der Titel der Session, in die man gerade tippt, steht weit oben.

**Wann.** Eine Seite zeigt zwei oder mehr Instanzen desselben Dings, und jede trägt dieselben Abschnitte: Masterclass-Sessions einer Organisation, Interview Tables, Company-Tour-Stopps, die Bühnen von „Eure Bühne“. **Nicht,** wenn die Instanzen verglichen werden sollen (dann eine Tabelle, eine Zeile je Instanz, Bearbeiten im Schubfach), und nicht bei **einer** Instanz (dann kein Umschalter, die Seite ist wie vorher).

**Bausteine, alle vorhanden:** `SectionTabs` (`components/layout/SectionTabs`) mit `aktiv` und einer Adresse mit Query; darunter die gewählte Instanz als Kopfkarte (`Card`, Titel `h2`, Stand, Slot) und die Abschnitte als `Card` mit `CardHeader ebene="h3"` — **genau einmal**. Ein eigener Baustein (`InstanzWahl`: Reiter, am Handy ab vier Einträgen eine Auswahl, optionales `marke` je Eintrag) entsteht erst **nach dem dritten Einsatz**.

```tsx
export default async function Seite({ searchParams }: { searchParams: Promise<{ instanz?: string }> }) {
  const { instanz } = await searchParams;
  const liste = await ladeInstanzen(); // schon auf die eigene Organisation gefiltert
  const gewaehlt = liste.find((x) => x.id === instanz) ?? vorgabe(liste);

  return (
    <>
      <PageHeader … />
      {liste.length > 1 && (
        <SectionTabs
          label={t.instanzWaehlen} // „Masterclass wählen“
          items={liste.map((x) => ({ href: `?instanz=${x.id}`, aktiv: x.id === gewaehlt.id, label: kurztitel(x) }))}
        />
      )}
      <Instanz key={gewaehlt.id} x={gewaehlt} /> {/* Kopfkarte und Abschnitte, einmal */}
    </>
  );
}
```

`key={gewaehlt.id}` setzt die Formulare beim Wechsel zurück — sonst bliebe der Entwurf der einen Instanz im Feld der anderen stehen.

- **Vorgabe:** die Instanz, die etwas von der Person will (offene Aufgabe, nächste Frist), sonst die erste. Ohne `?instanz` oder mit unbekannter Kennung kommt immer dieselbe — kein 404.
- **Kurztitel:** der Titel der Instanz; sind sie gleich oder leer, Nummer und Slot („Masterclass 1 · Fr 10:00“). Was etwas verlangt, steht im Kopf der Instanz **in Worten** („Titel fehlt“), nicht nur in einer Farbe.
- **Die Adresse ist der Zustand:** `aria-current="page"` am Reiter, die Rückwärtstaste geht zur vorigen Instanz, Mails und Aufgaben verlinken mit `?instanz=` direkt in die Instanz. Nach dem Speichern bleibt die Seite in der Instanz (`router.refresh()` behält die Adresse).
- **Ungespeichertes:** ein Klick auf einen anderen Reiter fragt von selbst nach — `useUngesichert` fängt Link-Klicks ab (Muster „Formular“). Keine eigene Abfrage bauen.
- **Überschriften:** `h1` der Seitentitel, die gewählte Instanz `h2`, ihre Abschnitte `h3`.
- **Nur die gewählte Instanz laden und zeichnen:** kürzere Seite, kleineres DOM, ein Satz Formulare.
- **Handy:** bis drei Instanzen Reiter (sie brechen um, 44 px je Reiter); ab vier oder bei langen Titeln eine **Auswahl** (`Select`, Beschriftung „Masterclass“, wechselt die Adresse) — den Baustein gibt es mit dem dritten Einsatz, bis dahin bleiben es Reiter.
- **Prüfen vor dem PR:** ein Formular je Abschnitt im DOM, der Wechsel setzt den Entwurf zurück, Aufruf mit `?instanz=` und mit falscher Kennung, 375 px.

Zuerst umgesetzt: `/partner/masterclass` (Partner-Chat). Danach prüfen: Interview Tables, Company-Tour-Stopps, „Eure Bühne“ (PART-138).

## Liste mit Zeilenaktion (PART-149, ab 09.10.2026)

Konrad 09.10.2026 (Bild `docs/bilder/part-149-wer-spricht.webp`): im Block „Wer spricht“ der Masterclass stehen „Angaben pflegen“ unter jedem Speaker und „Speaker eintragen“ unter der Liste — der Block besteht aus gestapelten Knöpfen. Regel (Skill 13): **Aktionen stehen dort, wo sie wirken.**

- **Hinzufügen → Kopfzeile des Blocks,** rechts neben dem Titel: `CardHeader` hat den Platz (`action`), `Button size="sm" variant="secondary"` (die primäre Aktion der Seite bleibt eine andere). **Leere Liste:** der Leerzustand trägt dieselbe eine Aktion (Regel 9); die Kopfzeile zeigt sie dann **nicht** zusätzlich.
- **Bearbeiten → in der Zeile,** rechts, auf Höhe der ersten Zeile: `Button size="sm" variant="secondary"`. Mehr als eine Zeilenaktion: die wichtigste sichtbar, der Rest im `Menu` („Weitere Aktionen“); Löschen nie als zweiter Knopf neben „Bearbeiten“.
- **Öffnet die Aktion ein Formular,** steht es im Schubfach (`Drawer`) oder Fenster, nicht aufgeklappt unter dem Knopf — sonst springt die Kopfzeile, und die Liste rutscht weg. Meldungen der Aktion bleiben dort (ADM-062).
- **Wenige Angaben je Zeile** (Name und eine Zeile): die Zeilenliste unten. **Drei oder mehr Angaben:** `Table stapeln` mit Aktionsspalte (wie Talk, PART-136), die Aktion in der letzten Spalte.
- **Zustand in Worten:** die zweite Zeile sagt, was fehlt („Position und Unternehmen fehlen noch“), die Aktion dazu steht rechts.
- **Vorlesen:** jede Zeile trägt dieselbe Aktion, also trägt der Knopf den Bezug: `aria-label="Angaben pflegen: {Name}"`.
- **Handy:** Text und Aktion stehen in einer Zeile, solange sie passen; sonst bricht die Aktion **unter** den Text (links, 44 px) — nie rechts gequetscht, nie der Knopftext auf zwei Zeilen.

```tsx
<CardHeader
  ebene="h3"
  title={t.wer}
  description={t.werHinweis}
  action={canEdit && speakers.length > 0 && <Button size="sm" variant="secondary" onClick={oeffneEintragen}>{t.eintragen}</Button>}
/>
<ul className="flex flex-col divide-y">
  {speakers.map((s) => (
    <li key={s.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="ct-label text-ink">{s.name}</p>
        <p className="ct-small text-muted">{s.position ?? t.angabenFehlen}</p>
      </div>
      {canEdit && (
        <Button size="sm" variant="secondary" aria-label={`${t.angabenPflegen}: ${s.name}`} onClick={() => oeffnePflegen(s)}>
          {t.angabenPflegen}
        </Button>
      )}
    </li>
  ))}
</ul>
```

Zuerst umgesetzt: `/partner/masterclass` („Wer spricht“, Partner-Chat); danach `/partner/talk` (die Tabelle hat die Aktion schon in der Spalte, „Speaker eintragen“ wandert in die Kopfzeile) und weitere Listen mit Zeilenaktion. Ein Baustein `Zeilenliste` entsteht nach dem dritten Einsatz — das Speaker-Fenster hat die Zeile (Titel, Zeit und Ort, Marken, Angabenzeile) für Side Events lokal gebaut (`components/speaker/SideEventsBlock.tsx`).

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

#### B′ · Detail aus Blöcken (Vorschlag LEAD-055, 05.10.2026 — noch nicht umgesetzt)

Für das Personenfenster der Pipeline und die Admin-Detailseite eines Speakers; Entwurf mit Bildern in `docs/design-vorschlaege-2026-10-05.md`. Der Archetyp B bleibt gültig, bis der Speaker-Chat umbaut. Die Änderung in drei Sätzen: **Handlungsband und zwei Spalten werden zu einem Kopf und einer Spalte aus Blöcken.**

- **Der Kopf trägt die Rangfolge:** Person (Foto, Name, Jobtitel · Organisation, Badges), **eine Hauptaktion** (primär, das Verb des nächsten Schritts), „Weitere Aktionen“ (`Menu ton="hell"`), die `Stufenleiste` (wo steht die Sache im Ablauf) und eine Kontextzeile (Betreuung, Als Nächstes, Kontakt). Aktionen mit „…“ öffnen ein Panel direkt unter der Zeile, keinen Dialog über dem Dialog.
- **Fünf Blöcke in fester Reihenfolge** (`Block`): Grunddaten, Pipeline, Onboarding, Hospitality, Programm. Die Reihenfolge ändert sich nie, nur was offen ist; der Rest ist eine Zeile mit Titel, Marke („Nächste Pflicht“, „Offen · 2“, „Erledigt“ — Wort **und** Ton) und einer Kurzfassung, die wiederholt nie, was der Kopf sagt, und verrät nichts, was die Rolle nicht sehen darf.
- **Was die Rolle oder der Stand nicht zeigt, wird nicht gezeichnet:** kein zugeklappter Block mit Schloss, keine Lücke.
- **Eine Spalte** im Fenster, auf der Seite und am Handy; zwei Spalten nur innerhalb eines Blocks. Am Handy **Aufklappen statt Reiter** — die Zeilen mit ihren Marken sind die Übersicht.
- **Im Fenster** sind die Blöcke Abschnitte mit Trennlinie (`border-t`), **auf einer Seite** Karten (`karte`, `ebene="h2"`) — nie Karte in Karte. Unterüberschriften stehen eine Ebene unter dem Block (`ct-label`).
- **Die eine primäre Aktion ist die Hauptaktion**; „Änderungen speichern“ ist `secondary`. Ungespeichertes in zugeklappten Blöcken ist unsichtbar — deshalb fragt Schließen mit `ConfirmDialog`.

### C · Formular als Ablauf (umgesetzt im Reisekostenantrag der Speaker)

Für alles, was **nacheinander** ausgefüllt wird: Anmeldung, Einreichung. Für unabhängige Teile gilt C′ darunter.

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

### C′ · Formular aus unabhängigen Abschnitten (umgesetzt in `/partner/onboarding`, „Eure Daten“, PART-106)

Für Daten, die in beliebiger Reihenfolge ausgefüllt werden und deren Stand aus dem **Inhalt** kommt, nicht aus der Position.

```
┌ Kopf: Titel · ein Satz ──────────────────────────────────────┐
│ ████████░░░░░░░░  2 von 4 Bereichen ausgefüllt  [Offen]       │   ← die Zahl, immer mit Wort
│ Ihr könnt jederzeit aufhören — … speichert ihr unten.         │
│ Zum Abschluss fehlt noch: Logo · Rechnungs-E-Mail             │
│ ┌ Auf dieser Seite ───────────────────────────────────────┐   │
│ │ ↓ Unternehmen  ↓ Beschreibung  ↓ Logo  ↓ Rechnungsdaten │   │   ← Sprungmarken, ohne Unterseiten
│ └─────────────────────────────────────────────────────────┘   │
│ ┌ UNTERNEHMEN                                [Fertig] ⌄ ──┐   │   ← `Block karte ebene="h2"`: Stand und
│ │ Muster · Musterstraße 1, 80331 München                  │   │     Kurzfassung in der Zeile (zu)
│ ├ BESCHREIBUNG                               [Offen]  ⌃ ──┤   │   ← der erste, der noch etwas braucht,
│ │ (Felder)                                                │   │     steht beim Laden offen
│ └─────────────────────────────────────────────────────────┘   │
│ ═══ klebt, nur bei Ungespeichertem ══════════════════════════ │
│ Ihr habt Änderungen …           Verwerfen  [Änderungen speichern] │
└───────────────────────────────────────────────────────────────┘
```

- **Jeder Abschnitt ist ein `Block`** (`karte`, `ebene="h2"`, `marke` Fertig/Offen/„1 von 2“, `kurz` = was drinsteht oder was fehlt): die ganze Zeile ist das Ziel, mit Pfeil — so erkennt man, **dass** sie klickbar ist. Man öffnet in jeder Reihenfolge, auch mehrere zugleich; kein „Zurück“ und „Weiter“.
- **Der Stand wird aus dem Entwurf gelesen** (reine Funktionen in `bloecke.ts`), nicht aus dem Gespeicherten: Marken und Zahl stimmen schon beim Tippen. Welcher Abschnitt beim Laden offen steht, wird einmal festgelegt — ein Abschnitt springt nicht zu, weil er beim Tippen fertig wurde.
- **„Auf dieser Seite“** (`AbschnittsNavigation`) springt zum Abschnitt und öffnet ihn; die Seitenleiste zeigt dieselben Abschnitte als Unterpunkte (QS-026). Es entstehen keine neuen Seiten.
- **Gespeichert wird gesammelt:** eine klebende Leiste („Änderungen speichern“, „Verwerfen“) erscheint **nur**, wenn es Ungespeichertes gibt (`weichtAb` über die Aufbereitung zum Speichern), `useUngesichert` warnt beim Verlassen, ein Fehler steht in der Leiste statt im Toast. Was sofort wirkt (Upload, Einwilligung), steht nicht im Entwurf und sagt das.
- **Nach dem Abschluss bleibt es dieselbe Seite** — als Profil mit allen Abschnitten zu und dem Satz „Eure Daten stehen“.

### D · Übersicht (umgesetzt in `/partner`)

Die Startseite eines Bereichs; im Menü und in der Überschrift heißt sie **„Home“** (QS-076) — „Übersicht“ ist nur der Name dieses Musters. Beantwortet in dieser Reihenfolge: **Wo bin ich · Was ist zu tun · Wie steht es · Wen frage ich.**

```
┌ HeroBand ── Gruss mit Highlight · ein Satz · [Aktion] · [Kennzahl] ┐  Navy
├────────────────────────────────────────────────────────────────────┤
│ NextStepBanner ── „3 von 8 Aufgaben offen"          [ Zur Liste ]  │  Akzent
├──────────────────────┬──────────────────────┬──────────────────────┤
│ ▲ Bildfläche         │ ▲ Bildfläche         │ ▲ Bildfläche         │  Einstiege
│ Deine Session        │ Anreise              │ Deine Grafik         │  (PhotoCard,
│ (kursiv) · ein Satz  │ (kursiv) · ein Satz  │ (kursiv) · ein Satz  │   QS-037, QS-076)
├──────────────┬───────┴──────┬──────────────┬┴──────────────────────┤
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

## Das Talent-Muster (QS-037, ab 24.09.2026)

Konrad, Feedback-Runde 24.09.: Auf der Startseite des Teilnehmer-Portals ist das Design *„sehr gut umgesetzt mit klaren farblichen Hierarchien, es wurden auch die Schriftarten besser verwendet (bspw. die Italic Schrift), Platzhalter für Bilder gesetzt"* — alle übrigen Portale werden danach umgestaltet. Vorbild: `app/(talent)/start/page.tsx`, erste Übertragung: `app/(speaker)/speaker/page.tsx`.

**Was die Seite ausmacht — drei Farbstufen statt einer.** Vorher hatte jede Seite genau eine: schwarze Überschriften auf Weiss, die Hierarchie nur an der etwas dunkleren Schrift erkennbar (Konrad zum Partner-Logo, PART-060). Jetzt: Navy (das Band: wo bin ich) → Akzent (das kursive Wort, die Aktion: worum geht es) → Akzent-Soft (die Bildflächen: wohin kann ich) → Weiss (die Arbeit). Das Auge fällt in dieser Reihenfolge.

**Startseite**

1. `HeroBand` mit Gruss und **einem** Highlight-Wort (`highlight`, Pink auf Navy), einem Satz, **genau einer Aktion** und rechts der Kennzahl. Die Aktion ist der nächste offene Schritt, nicht „Mehr erfahren" — wer alles erledigt hat, bekommt den Weg zum Kern des Portals.
2. Darunter die **drei Einstiege** als `PhotoCard`: Bildfläche, **eine** kursive Überschrift — der Name der Seite, zu der die Karte führt, keine zweite Zeile darunter (QS-076) —, ein Satz, eine Nebenaktion (`variant="secondary" size="sm"`). Drei, nicht vier — die Website zeigt drei, und die dritte Karte ist die, bei der man merkt, ob man auswählt oder aufzählt. Die Bildflächen sind der Platz für die Penno-Fotos (QS-027); bis dahin trägt sie die Dreiecksform.
3. Dann die Arbeit (Checkliste, Termine), dann die Ansprechpersonen.

Wer im Namen eines anderen arbeitet (Assistenz), wird nicht mit dessen Vornamen begrüsst: Titel bleibt der Name, ohne Highlight.

**Einstiege nach Rolle:** Wo ein Portal mehrere Rollen trägt (Admin), zeigt die Startseite die ersten drei Abschnitte, die die Rolle öffnen darf — geprüft mit derselben Funktion wie die Seitenleiste (`canEnterAdminSection`). Eine Karte, die danach mit 404 antwortet, ist schlimmer als keine. Wo ein Portal Leistungen bucht (Partner), folgen die Einstiege den sichtbaren Menüpunkten (`visibleNavKeys`).

**Unterseite**

- `PageHeader word={…}`: das kursive Wort ist **derselbe Begriff** wie auf der Einstiegskarte, die hierher führt. Man erkennt die Seite, bevor man den Titel gelesen hat.
- Das Wort ist der eine Laica-Moment des Screens. Keine zweite Kursive auf derselben Seite.

**Abschnitte**

- Ein `<h2>` ist `.ct-h2` (Versalien, ExtraBold, 18/24) — auch in Karten. Vorher trug jede Abschnittskarte `.ct-h3` (16/24 SemiBold), also fast Fliesstextgrösse; H1 und Fliesstext hatten nichts dazwischen. **Jeder `CardHeader` trägt seine Ebene ausdrücklich** (QS-054, Konrad 04.10.2026, K-60: „Versalien passen, bitte alle umstellen“; im Kit eine Pflichtangabe, der Compiler verlangt sie): `<CardHeader ebene="h2" …>` ist der Kopf eines **Abschnitts der Seite** — auch wenn die Karte sich je Tag, Session oder Stopp wiederholt und jede ihren eigenen Inhalt trägt; `<CardHeader ebene="h3" …>` bleibt für einen **Unterabschnitt unter einer Überschrift derselben Einheit** (Inhalt, Goodies und Sprecher unter dem Titel einer Masterclass) und für **gleichförmige Listeneinträge** (Challenge-Katalog, Karte je Team). Die Ebene steht als erste Eigenschaft; jeder `h3` steht in `tests/cardheader-ebene.test.ts` mit Grund, ein neuer fällt ohne Eintrag durch. Im Zweifel `h2`: ein Kopf, den die Seite als Abschnitt braucht, ist eine Überschrift der zweiten Ebene.
- `.ct-h3` bleibt für Titel **innerhalb** eines Abschnitts, für Meldungskarten (Zustände wie „noch nicht freigeschaltet", „Erfassung gesperrt"), für Dialog- und Paneltitel, für Werkzeugschritte (Grafik-Maske) und für dynamische Objekttitel (Einladung, Buchung).
- **Eine** Karte je Seite darf den Akzent-Umriss tragen (`border-accent`): die, um die es auf der Seite geht — auf der Session-Seite der Slot. Mehr als eine, und keine ist mehr hervorgehoben (Website-Karte, `website-bloecke.md`).

**Die Wörter je Portal** (DE / EN, im Wörterbuch des Bereichs)

| Portal | Seite | Wort |
|---|---|---|
| Speaker | Startseite (Leerzustand), Session | Bühne / Stage |
| Speaker | Anreise & Unterkunft | Unterwegs / Journey |
| Speaker | Deine Grafik | Spotlight / Spotlight |
| Speaker | Tickets | Zugang / Access |
| Speaker | Reisekosten | Erstattung / Refund |
| Speaker | Deine Bilder | Erinnerungen / Memories |
| Speaker | Profil | Steckbrief / Bio |
| Partner | Startseite (Leerzustand) | Partnerschaft / Partnership |
| Partner | Eure Daten | Unternehmen / Company |
| Partner | Kontakte | Team / Team |
| Partner | Checkliste | Vorbereitung / Preparation |
| Partner | Dateien | Material / Material |
| Partner | Tickets | Zugang / Access |
| Partner | Event-App | Sichtbarkeit / Visibility |
| Partner | Messestand | Präsenz / Presence |
| Partner | Messeshop (alle Reiter) | Ausstattung / Equipment |
| Partner | Bewerber | Talente / Talent |
| Partner | Hackathon | Challenge / Challenge |
| Partner | Branding | Marke / Brand |
| Partner | Euer Talk | Bühne / Stage |
| Partner | Side-Event | Einladung / Invitation |
| Partner | Interview Tables | Gespräche / Conversations |
| Partner | Standbühne | Programm / Programme |
| Speaker-Leads | Startseite (Leerzustand), Pipeline | Line-up / Line-up |
| Speaker-Leads | Bestätigte Speaker | Onboarding / Onboarding |
| Speaker-Leads | An- und Abreise | Unterwegs / Journey |
| Speaker-Leads | Shuttle | Transfer / Transfer |
| Speaker-Leads | Programm-Board (auch Tabelle) | Programm / Programme |
| Speaker-Leads, Admin | Einreichungen (`components/einreichungen`) | Auswahl / Selection |
| alle | Wiki (`components/wiki/WikiPage`) | Wissen / Know-how |
| Admin | jeder Abschnitt (31) | im Wörterbuch unter `admin.words.<Abschnitt>` — ein Wort je Abschnitt aus `lib/admin-sections.ts`, dasselbe auf der Einstiegskarte und in jedem Seitenkopf des Abschnitts (auch Detailseiten: *Line-up* über dem Namen eines Speakers). Die Einstiege der Startseite folgen der Rolle: `app/(admin)/admin/einstiege.ts` |
| Talent | Einstiege | Entdecken · Überblick · Profil |

Neue Wörter: ein Wort, kein Halbsatz; ein Begriff aus der Welt des Nutzers, nicht aus der Bedienung („Zugang", nicht „Verwalten"); nie derselbe wie der Titel darunter.

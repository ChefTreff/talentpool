# Design-Quellen · 21st.dev und Dribbble-Dashboards (QS-038)

Konrad, 24.09.: *„Hier gibt es noch zwei Seiten, die mir empfohlen wurden für hochwertige Design-Elemente: 21st.dev und dribbble.com/search/dashboard — hier könnten wir mal schauen, ob wir für Elemente, die wir nicht mit unseren Standardblöcken abdecken, nicht noch Elemente finden, die wir dann global anwenden können."*

Gelesen am 24.09.2026, nur lesend, keine Konten, kein Code übernommen. Gebaut wird **mit unseren Tokens und nach dem Skill** (`/portal-design`), nicht aus den Vorlagen kopiert: Die Sammlungen sind shadcn/React-Code mit eigenen Farben, Radien und Animationen, und ein fremdes Icon-Set oder eine fremde Formensprache steht auf der Verbotsliste.

## Was die Quellen sind

- **[21st.dev](https://21st.dev/components)**: über 12.000 React-Bausteine aus Community-Bibliotheken (shadcn/ui, Origin UI, Magic UI, Aceternity …), sortiert nach Kategorien. Den größten Teil machen Marketing-Blöcke aus: animierte Heros, Shader, Verläufe, Marquees. Darunter liegen gut 60 Kategorien für Arbeitsoberflächen: Suchfelder, Fortschritt, Tabs, Timelines, Tooltips, Kalender, KI-Chats, Datei-Uploads.
- **[Dribbble · Dashboard](https://dribbble.com/search/dashboard)**: Entwürfe für Dashboards und Admin-Oberflächen. Wiederkehrende Elemente sind Kennzahlen als große Zahl, **Fortschrittsringe mit der Zahl in der Mitte**, Balken, Begrüßungs-Köpfe („Welcome, …"), Personen-Stapel und helle Flächen mit einer Akzentfarbe. Das ist dieselbe Richtung wie das Talent-Muster (QS-037).

## Nicht übernehmbar (Verbotsliste, Bewegungsregel, Formensprache)

Animierte Heros und Hintergründe, Shader, Verlaufsflächen, „Liquid Glass" und Glassmorphismus, Zahlen, die hochzählen (Number Ticker), Marquees, 3D-Globen, eigene Mauszeiger, Knöpfe, die beim Überfahren wachsen, Pillenformen. Warum: Bewegung nur als Rückmeldung ≤ 200 ms, keine dekorative Animation, eine Form (8-px-Rechteck), Marke nie in Datenansichten.

## Übernommen (mit diesem PR)

| Element | Vorbild | Im Kit | Eingesetzt |
|---|---|---|---|
| **Suchfeld** | 21st „Search Bars", Team-Portal-Muster | `SuchFeld`: Lupe vorn, `type="search"` (Telefon-Tastatur mit Suchen-Taste, Löschen-Zeichen, Vorlesesoftware kündigt eine Suche an), Wert und Filterlogik bleiben bei der Seite | 7 von 9 Suchen: Admin-Speaker, Admin-Speaker-Leads, Admin-Team, Admin-Grafiken, Admin-Mail-Protokoll, Reiseliste (Admin und Speaker-Leads), Partner-Messeshop. **Offen bei den Besitzern:** Programmtabelle (`components/programme`, Board-Kern beim Speaker-Chat, QS-039) und Wiki (`components/wiki`, PART-058 beim Partner-Chat) |
| **Fortschritt** als Balken oder Ring, immer mit Zahl | 21st „Progress", Dribbble-Ringe | `Fortschritt`: `progressbar` mit Wert, Höchstwert und Satz für Vorlesesoftware; Töne `hell` und `navy` | Partner-Übersicht „Eure Pflichten" (vorher dort von Hand gebaut, als Bild ohne Wert). Der Ring steht für die Event-App-Schritte bereit (Vorschlag PART-074) und für jede Übersicht, deren Stand eine Zahl ist |

Beide stehen in der Kit-Schau unter `/design`, zusammen mit den Bausteinen vom selben Tag (Übersicht, Frist-Marke, Kalender-Knöpfe).

## Kurzliste für später

Jeder Punkt braucht erst einen Anlass auf einer Seite, und der zuständige Chat entscheidet mit. Ein Baustein ohne Verwendung ist Wartung ohne Nutzen.

| Element | Vorbild | Wofür bei uns | Anlass / wer |
|---|---|---|---|
| Timeline / Verlauf | 21st „Timelines", Dashboards | Verlauf je Speaker oder Partner (wer hat wann was geändert), Audit im Admin | braucht Verlaufsdaten; Admin-Chat |
| Segmentschalter | Team-Portal „Ich \| Team", 21st „Tabs/Toggles" | zwei Sichten derselben Liste, im 8-px-Rechteck | erste Liste mit Perspektivwechsel |
| Tooltip | 21st „Tooltips" | Zeichen-Knöpfe ohne Text (Kalender-Marken nutzen heute `title`) | sobald mehr Zeichen-Knöpfe dazukommen |
| Personen-Stapel | 21st „Avatars", Dashboards | Speaker eines Slots, Team eines Partners, mit `PortraitShape` (eine Porträt-Form) | Board-Karte (LEAD-017), Partner-Kontakte |
| Ablagefläche zum Hineinziehen | 21st „File Uploads" | `FileButton` um Drag & Drop erweitern, Auswahl und Hochladen bleiben zwei Schritte (QS-025) | Präsentations- und Logo-Upload |
| Chatfenster | 21st „AI Chats" | der echte Chat im Wiki (ADM-044): Fenster nicht modal wie die Assistent-Blase, Quellen als Links | Admin-Chat baut den Kern, Gestaltung mit Design |
| Kennzahl mit Veränderung | Dribbble-Kennzahlen | Admin-Übersicht („+12 seit gestern") | braucht Vergleichswerte |

Für den Kalender des Programm-Boards (21st „Calendars", Dribbble) liegt der Vorschlag schon vor: `docs/design-vorschlaege-2026-09-24.md`, LEAD-017.

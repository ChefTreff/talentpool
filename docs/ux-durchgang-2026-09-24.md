# UX-Durchgang über alle Oberflächen · 24.09.2026 (QS-013)

QS-013 (Runde 2, 14.09.): *„Hierarchien und Handlungsflächen sind unklar → UX-Durchgang über alle Oberflächen: Hierarchien schärfen, Handlungsflächen sichtbar machen, aufräumen."*

Der Durchgang lief in zwei Schritten. Der erste waren die Punkte aus Konrads Sichtprüfungen vom 24.09., jeder für alle Portale gelöst. Der zweite war eine Prüfung des gesamten Quelltexts gegen die Regeln des Skills (`scripts/ux-pruefung.mjs`) samt Korrektur dessen, was sich dabei zeigte. **Was noch aussteht, ist der Blick auf die Seiten mit echten Daten.** Der braucht eine Anmeldung und gehört in Konrads Durchgang.

## 1 · Heute gelöst, global

| Thema | Punkt | PR |
|---|---|---|
| **Hierarchie der Seiten:** kursives Schlüsselwort im Seitenkopf, `<h2>` als `.ct-h2`, Band mit einer Aktion, Einstiege mit Bildfläche | QS-037 | #143, #148, #150, #151 |
| **Handlungsflächen sichtbar:** keine Randfarbe griff (Feldränder 1,34:1, Zweitknöpfe ohne Umriss, kein Fokus-Rand, keine Fehlerränder) | QS-041 | #145 |
| **„Auf dieser Seite" als Menü** erkennbar, der erste Anker der Seite | QS-042 | #155 |
| **Kalender** überall mit denselben drei Wegen | QS-043 | #158 |
| **Fristen** rechts im Abschnittskopf, gross, nach Stand gefärbt | QS-044 | #162 |
| **Seitenleiste** mit drei Ebenen, Admin in Lila, Portale unten | QS-045, QS-046 | #166 |
| **Links nach draussen** im neuen Fenster mit Ansage | QS-034 | #153 |
| **Suchfeld und Fortschritt** als gemeinsame Bausteine | QS-038 | #169 |

## 2 · Prüfung gegen die Regeln (`scripts/ux-pruefung.mjs`)

Das Skript liest `app/` und `components/` und meldet mögliche Verstösse. Es liefert eine Liste zum Hinsehen, keinen Test, denn manche Treffer sind gewollt. Stand vor und nach diesem PR:

| Regel | vorher | nachher | Einordnung |
|---|---|---|---|
| rohe px-Werte | 18 | 3 | Seitenbreiten auf Tokens (`max-w-detail`, `max-w-text`, `max-w-content`), feste Spalten und Formen auf das Raster (`w-50`, `w-70`, `w-28`, `min-w-225`, `size-85`, `w-65`). **Offen bei den Besitzern:** das Programm-Board (`min-w`, Dialogbreite; Board-Kern beim Speaker-Chat, QS-039) und die Wiki-Seitenleiste (PART-058, Partner-Chat) |
| `<h2>` als `.ct-h3` | 50 | 39 | Abschnitte auf `.ct-h2`: Post-Generator, Catering (Admin, Produktion, Volunteers), Ernährung (Speaker-Anreise, Volunteers), Talent „Meine Teilnahme", Lebenslauf und Porträt. **Die übrigen sind gewollt:** Dialog- und Paneltitel, dynamische Titel (Organisation, Person, Reception, Talk), Meldungskarten („nicht freigeschaltet") und Werkzeugschritte (Grafik-Maske). Dazu kommen die Portale Hackathon und Volunteers, die ruhen |
| Seitenkopf ohne Wort | 12 | 9 | Neu: Admin-Programmfreigabe (*Programm*), Talent-Programm (*Entdecken*) und „Meine Teilnahme" (*Überblick*), jeweils dasselbe Wort wie auf der Talent-Einstiegskarte. **Offen:** Hackathon (4) und Volunteers (2) ruhen. Talent-Profil, -Onboarding und -Löschen bekommen ihr Wort mit dem Umbau des Talent-Chats: Die Karte heisst dort „Profil", das Wort wiederholte den Titel |
| Seite ohne Kopf | 15 | 15 | alles Fehlalarm: Den Kopf rendert eine Shell (Admin-Partner, Admin-Volunteers, Messeshop), oder es ist der Einlass-Kiosk |
| mehr als eine primäre Aktion | 2 | 2 | Fehlalarm: Speaker- und Partner-Übersicht haben je zwei Knöpfe im Code, gezeigt wird je nach Stand einer |
| `text-muted-soft` für Text | 1 | 1 | der Trennstrich im Sprachumschalter, `aria-hidden` und reine Zier |
| roher Hex-Wert | 1 | 1 | ein Kommentar |

## 3 · Was noch aussteht

- **Durchgang mit Daten** durch alle Portale, bei 1440 und 375 px. Er braucht eine Anmeldung und läuft deshalb in Konrads nächster Runde. Die Bausteine sind ohne Daten in der Kit-Schau `/design` zu sehen.
- **Beim Umbau der Besitzer:** Board (LEAD-017, Vorschlag liegt), Wiki (PART-058, Vorschlag liegt), Event-App-Schritte (PART-074, Vorschlag liegt) und das Talent-Profil (TAL-013).
- **QS-047** (Wörterbuch-Kollisionen): Vorschlag folgt, gebaut wird erst nach Freigabe.

# Admin-Vollständigkeit — Prüfung 24.09.2026

Regel (Konrad, 22.09.2026): Jede Team-Funktion eines Unterportals muss auch im Admin-Bereich erreichbar und bearbeitbar sein. Geprüft wurden alle Routen der Unterportale (Stand `main` 70a6f90, nach #144) gegen die Admin-Routen. Externe Portale (Talent, Partner, Volunteers als Helfende, Hackathon-Teilnehmende, Speaker) enthalten keine Team-Funktionen und sind hier nur genannt, wo ein Team-Gegenstück fehlt.

| Unterportal-Route | Funktion | Admin-Weg | Stand |
|---|---|---|---|
| `/produktion/*` (alt) | Regie, Stände, Bestellungen, Catering, Dateien | `/admin/produktion/*`, `/admin/regie`, `/admin/catering` | erledigt mit #144 (PORT2), alte Adressen leiten weiter |
| `/speaker-leads` (Pipeline) | Speaker anlegen, bearbeiten, Status | `/admin/speaker`, `/admin/speaker/[id]`, `/admin/speaker-leads` | vorhanden (ADM-012…015) |
| `/speaker-leads/board`, `/board/tabelle` | Programm-Board, Tabelle | `/admin/programm`, `/admin/programm/tabelle` | vorhanden; eine Komponente (QS-039) |
| `/speaker-leads/einreichungen` | Einreichungen prüfen | `/admin/einreichungen` | vorhanden |
| `/speaker-leads/regie` | Regieanweisungen je Bühne | `/admin/regie` (+ `/regie/druck`) | vorhanden; Bearbeitung durch Leads kommt mit LEAD-031 |
| `/speaker-leads/shuttle` | Shuttle anfordern | `/admin/hospitality` (Liste, Freigabe, Export ADM-028) | vorhanden |
| `/speaker-leads/anreise` | Anreise der betreuten Speaker | `/admin/anreise` | vorhanden |
| `/volunteers/team`, `/volunteers/schichten` | Team- und Schichtsicht der Volunteer-Leitung | `/admin/volunteers`, `/admin/volunteers/schichten`, `/admin/volunteers/tickets` | vorhanden |
| `/checkin` (Kiosk) | Scannen am Einlass | **fehlt:** keine Admin-Sicht auf Scans, Zulassungen, Abweisungen | **Lücke → ADM-051** |
| `/partner/bewerber`, Formatseiten | Partner entscheidet über Bewerbungen | `/admin/bewerbungen` (ADM-003 offen: Überarbeitung mit Konrad) | vorhanden, überarbeiten |
| `/partner/buehne` | Standbühnen-Slots | `/admin/programm` (Freigabe LEAD-022 offen) | vorhanden; Freigabe-Bereich folgt |
| `/partner/shop` | Messeshop-Bestellungen | `/admin/partner/bestellungen`, `/admin/produktion/bestellungen` | vorhanden |
| `/partner/messestand`, `/branding`, `/hackathon` | Uploads und Pflichten | `/admin/partner/[org]`, `/admin/partner/review` | vorhanden |
| `/hackathon/judging` | Bewertung durch Jury | kein Admin-Weg | ruht bis zur Feature-Übersicht Hackathon (Konrad, Woche ab 28.09.) |

**Ergebnis:** eine Lücke (Check-in im Admin, ADM-051), zwei bekannte offene Punkte (ADM-003 Bewerbungsübersicht, LEAD-022 Freigabe). Die Regel greift für Neues über PORT5 (jede neue Team-Funktion entsteht unter `/admin`), der statische Test aus #144 sichert, dass jede Admin-Seite ein Abschnitts-Gate zieht. Nächste Prüfung nach Konrads Admin-Runde.

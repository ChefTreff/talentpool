# make.com — verwaiste Webhooks (Team 158498), Stand 08.09.2026

Kriterium „verwaist": `enabled = true` **und** kein zugeordnetes Szenario (`scenarioId = null`). Diese Hooks nehmen weiterhin Requests an, verarbeiten aber nichts. Maßnahme laut Konrad (08.09.): **deaktivieren** (nicht löschen — reversibel). Hook-URLs bewusst nicht dokumentiert.

| Hook-ID | Name | Hinweis |
|---|---|---|
| 1240221 | Gipfel 25 – Warteliste + Feedback | |
| 1315247 | ChefTreff Gipfel 2025 Tickets | |
| 1380648 | Non-Customer | |
| 1450989 | Airtable Customer table (Gipfel 25) | |
| 1505404 | Vivenu Ticket personalization | Vivenu zeigt evtl. noch hierher |
| 1621962 | Ticket personalization – Gipfel 2025 (Create an account) | |
| 1635088 | Gipfel 2025 – Speaker Onboarding | |
| 1687111 | Speaker-Präsentationen | |
| 1719089 | Exhibitor Onboarding | |
| 1757726 | Pitch Competition | |
| 1758803 | VC Breakfast | |
| 1815314 | VC Breakfast update Swapcard person | |
| 1829571 | Masterclass Speaker-Onboarding | |
| 2012753 | Gipfel 2025 – Partner Backdrop Import | `gone = true` |
| 2065652 | Gipfel 2025 – Hackathon | |
| 2858505 | Monday Board Column Values (Eingangsrechnungen) | App-Hook monday3, `editable = false` |
| 3006879 | monday.com → Qonto | Finanzfluss — vor Deaktivierung Konrad bestätigen |
| 3010857 | Monday Board Column Values | monday3, `gone = true`, `editable = false` |
| 3254678 | Deal HubSpot → Invoice in SevDesk | Finanzfluss — vor Deaktivierung Konrad bestätigen |
| 3670136 | Impossible Founders Sprint | |
| 3672403 | Impossible Founders Sprint Personalization | |
| 3675118 | Create Prefil Form Innovation Sprint | |
| 3678813 | Typeform Events webhook [Newsletter] Gewinnspiel | Typeform-App-Hook (`data.enabled = false`) |

**Nicht verwaist, aber an inaktive Szenarien gebunden** (Vivenu/Swapcard-Stack FLS26): 3625874, 3644129, 3657307, 3499040, 3501573, 3346212, 3390769, 3695863 u. a. — bleiben bis zur Archiv-Entscheidung (Frage 54) unangetastet.

## Status
- ☐ Deaktivierung ausgeführt — **per API nicht möglich** (MCP kann `enabled` nicht setzen) → manuell in Make: *Webhooks → Hook → Disable*; Datum eintragen
- Reaktivierung: Make → Webhooks → Hook → „Enable".

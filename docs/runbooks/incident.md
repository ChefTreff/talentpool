# Runbook · Incident

**Auslöser:** Störung mit Nutzerwirkung, Verdacht auf unbefugten Zugriff oder
Datenschutzvorfall.

## Rollen
- **Lead:** Konrad (zugleich Datenschutz-Ansprechpartner).
- **Technik:** die Session/Person, die zuerst am Problem ist — dokumentiert mit.

## Ablauf
1. **Feststellen** — was ist beobachtbar? Zeitpunkt, betroffene Bereiche, Nutzerzahl.
   Screenshots ohne personenbezogene Daten.
2. **Eindämmen** — betroffenen Bereich abschalten (Feature, Szenario, Integration),
   bei Schlüsselverdacht sofort [key-rotation.md](key-rotation.md) (Sofort-Rotation).
3. **Bewerten** — sind personenbezogene Daten betroffen? Wenn ja: Umfang, Kategorien,
   Zeitraum. `audit_log` und Vercel-Logs sichern.
4. **Beheben** — Fix oder [rollback.md](rollback.md) / [restore.md](restore.md).
5. **Melden** — bei Datenschutzvorfall entscheidet Konrad über die Meldung an die
   Aufsichtsbehörde. Frist: 72 Stunden ab Kenntnis. TODO: Kontaktdaten der zuständigen
   Behörde ergänzen.
6. **Nachbereiten** — Zeitleiste, Ursache, Gegenmaßnahme in `docs/entscheidungen.md`
   bzw. hier unter Historie. Gegenmaßnahme wird zur Aufgabe, nicht zum Vorsatz.

## Was nie passiert
- Alt-Systeme oder Daten löschen, um „aufzuräumen" — nur deaktivieren.
- Zugangsdaten in Chat, Ticket oder Screenshot teilen.
- Betroffene informieren, bevor der Sachverhalt steht.

## Historie
| Datum | Vorfall | Wirkung | Gegenmaßnahme |
|---|---|---|---|
| TODO | | | |

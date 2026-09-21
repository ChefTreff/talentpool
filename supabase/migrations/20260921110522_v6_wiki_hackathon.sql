-- 0129 · Wiki: Hackathon-Inhalte für Partner (PART-018, Konrads Auftrag vom 21.09.).
--
-- Angewendet von der Architektur-Session am 21.09.2026 als 20260921110522.
--
-- Anlass: Konrad hat das Notion-Wiki „AI Hackathon 2026" als Quelle genannt (Welle 6 §D4) und
-- am 21.09. aufgetragen, die Wiki-Daten ins Portal zu übertragen, damit er sie dort prüfen kann.
--
-- **Alle Artikel stehen als `draft`.** Sie sind damit im Portal unsichtbar, bis Konrad sie
-- freischaltet — dieselbe Regel wie bei den zehn Artikeln aus 0096.
--
-- ---------------------------------------------------------------------------------------------
-- **Was aus der Quelle NICHT übernommen wurde, und warum** (Prüfung vor dem Schreiben, weil eine
-- Migration dauerhaft in der Git-Historie steht und sich nicht nachträglich bereinigen lässt):
--
-- 1. **Die Mobilnummer der Ansprechperson** (im Wiki steht eine 0162-Nummer neben zwei
--    dienstlichen Adressen). Ansprechpersonen gehören nach der Regel vom 17.09. in
--    `edition_contact` — dort mit Foto, dienstlicher Adresse und, bei Externen, dem
--    Einwilligungsdatum aus dem Vertrag (`contract_consent_at`, 20260918105038). Eine fest in
--    einen Artikeltext geschriebene Handynummer wäre zweimal falsch: sie umginge diese Prüfung
--    und stünde an einer zweiten Stelle, die niemand pflegt. Die Artikel verweisen stattdessen
--    auf die Ansprechperson im Portal.
-- 2. **Die Challenge-Liste 2026** (sieben namentlich genannte Partnerunternehmen, teils mit
--    Platzhaltern). Das sind Geschäftsdaten des Vorjahres; für FLS27 sagen sie nichts.
-- 3. **Die ausformulierten Challenge-Beschreibungen 2025** (1KOMMA5, BEAM.AI, Netlight/WFP,
--    Finanz Informatik, Otto Dörner, Eurogate, Knowunity). Sie beschreiben interne Probleme
--    fremder Firmen. Im internen Notion ist das etwas anderes als in einem Portal, in dem sich
--    **alle Partner** gegenseitig lesen könnten — darunter Wettbewerber. Wenn Konrad sie haben
--    will, gehört vorher die Zustimmung der genannten Firmen dazu; deshalb hier nicht.
-- 4. **Daten, Ort und Zeitplan 2026** (9./10. April, Factory Hammerbrooklyn, Luma-Link,
--    Bewerbungsfrist). Der Hackathon 27 läuft am 15./16.04.2027 an einem noch offenen Ort.
--    Übernommen ist nur, was jahresunabhängig gilt; der Ablauf kommt, wenn er steht.
--
-- Übernommen ist also der **zeitlose** Teil: Was eine gute Challenge ausmacht, was ein Partner
-- dafür liefert, was von Mentorinnen und Mentoren erwartet wird, und wie die Preise gedacht sind.
-- Das ist genau das, was ein Partner 2027 vor dem Einreichen wissen muss.
-- ---------------------------------------------------------------------------------------------

set search_path = public, extensions;

insert into kb_article (slug, edition_id, language, audience, roles, phase, title, body_md, status, sort_order)
values

('hackathon-challenge-definieren', null, 'de', '{partner}', '{}', 'evergreen',
 'Was eine gute Hackathon-Challenge ausmacht',
$md$
Eure Challenge ist die Aufgabe, an der die Teams 24 Stunden arbeiten. Sie entscheidet darüber,
ob am Ende etwas herauskommt, das euch nützt.

## Zwei Wege, die funktionieren

**Option A, unsere Empfehlung: ein Produkt oder eine Anwendung.** Die Teams bauen etwas, das
man ansehen und bedienen kann, mit einer KI-Lösung darin.

**Option B: eine Optimierungsaufgabe.** Ihr bringt einen Datensatz mit, das Ziel ist die beste
Vorhersagegüte.

## Was eure Challenge erfüllen sollte

- Sie lässt Raum für kreative Lösungen, statt eine bestimmte vorzugeben.
- Sie ist technisch eine Herausforderung, die sich mit KI im weiteren Sinne lösen lässt —
  Klassifizierung, Prognose, Sprachverarbeitung.
- Sie hat eine Produkt- oder Design-Komponente: eine App, eine Website, ein Dashboard, eine
  Automatisierung.
- Sie ist **in 24 bis 30 Stunden lösbar**.
- Wo Daten nötig sind, sind sie real verfügbar — öffentlich oder von euch bereitgestellt, etwa
  als CSV, JSON oder über eine Schnittstelle.
- Mindestens eine Person aus eurem Unternehmen begleitet das Event als Mentorin oder Mentor.

## Was wir von euch brauchen

1. Einen **klaren Rahmen**: die Problemstellung, der Kontext, die Vorgeschichte.
2. Ein **spezifisches Ziel**, das sich realistisch in euren Kontext einfügt.
3. Optional einen **Datensatz**.
4. Ein **Kurzbriefing** im Portal und einen Briefing-Call von etwa 30 Minuten.

Kommt mit einer klaren Problemstellung. Wenn ihr Daten habt, bringt sie mit — wichtig ist vor
allem der Kontext. Die Challenge soll spezifisch sein und trotzdem Kreativität erlauben.

Eure Challenge reicht ihr im Portal unter **Hackathon** ein. Danach schauen wir sie durch und
stellen sie den Teams vor.
$md$, 'draft', 10),

('hackathon-mentoren-jury', null, 'de', '{partner}', '{}', 'evergreen',
 'Mentorinnen, Mentoren und Jury',
$md$
Eure Leute vor Ort sind der Unterschied zwischen einer Aufgabe auf dem Papier und einem Team,
das weiß, worauf es ankommt.

## Wie viele

Wir empfehlen **eine bis fünf Personen** je Challenge-Partner.

## Wer passt

Menschen aus IT, Machine Learning, KI, Data Science oder Softwareentwicklung. Wenn ihr zusätzlich
jemanden aus HR oder People mitbringt, lohnt sich das für die Gespräche mit den Teilnehmenden.

## Was wir erwarten

Möglichst viel Zeit mit den Teams. Eine Übernachtung erwarten wir nicht — die Teams arbeiten
teils durch, eure Mentorinnen und Mentoren müssen das nicht.

## Jury

Bei den Abschlusspräsentationen können eure Mentorinnen und Mentoren als Jury wirken und die
Teams eurer Challenge bewerten. Die Bewertung läuft über die Hackathon-App; die Kriterien und
ihre Gewichtung legt ihr selbst fest, wenn ihr eure Challenge einreicht.
$md$, 'draft', 20),

('hackathon-preise', null, 'de', '{partner}', '{}', 'evergreen',
 'Preise für die Gewinnerteams',
$md$
Was ihr auslobt, steht euch frei. Aus den vergangenen Jahren wissen wir, was gut ankommt.

- **Immaterielles wirkt oft am stärksten:** ein Besuch bei euch, eine Werksführung, eine
  Einladung in die Zentrale.
- **Reisekosten** übernehmen oder ein Budget dafür bereitstellen.
- **Sachpreise.**
- **Zugang zu Software oder Guthaben** bei euren Diensten.

Was ihr auslobt, tragt ihr zusammen mit eurer Challenge im Portal ein. Die Teams sehen es,
bevor sie sich für eine Challenge entscheiden — ein guter Preis bringt euch die besseren Teams.
$md$, 'draft', 30),

('hackathon-pitch-vorstellung', null, 'de', '{partner}', '{}', 'evergreen',
 'Eure Vorstellung am ersten Morgen',
$md$
Zu Beginn stellt ihr euer Unternehmen und eure Challenge im Auditorium vor. Danach entscheiden
die Teilnehmenden, an welcher Challenge sie arbeiten.

- **Zeitrahmen:** etwa drei bis vier Minuten.
- **Umfang:** etwa vier Folien, das ist keine harte Grenze.
- **Danach:** ein Onboarding von 15 bis 30 Minuten für die Teams, die sich für eure Challenge
  entschieden haben. Dort geht es ins Detail.

Die Frist für eure Folien nennen wir rechtzeitig; sie liegt einige Tage vor dem Hackathon,
damit die Technik alles vorbereiten kann.
$md$, 'draft', 40),

('hackathon-teilnehmende', null, 'de', '{partner}', '{}', 'evergreen',
 'Wer beim Hackathon mitmacht',
$md$
## Zielgruppe

Tech-Talente aus Software Engineering, Data Science, Mathematik und Physik, UI/UX,
Ingenieurwissenschaften, Informatik und Wirtschaftsinformatik — Studierende, Young
Professionals und Quereinsteigerinnen und Quereinsteiger.

## Größenordnung

In den vergangenen Jahren waren es einige hundert Teilnehmende, aufgeteilt auf mehrere
Challenges mit jeweils etwa sechs Teams.

## Sprache

**Englisch.** Die Teilnehmenden kommen aus dem deutsch- und englischsprachigen Raum; eure
Challenge, eure Folien und euer Briefing sollten deshalb auf Englisch sein.

## Anmeldung

Die Teilnahme ist kostenlos, Verpflegung und Schlafplatz sind gestellt. Angemeldet wird sich
allein oder im Team; wer allein kommt, wird vor Ort einem Team zugeteilt.
$md$, 'draft', 50),

('hackathon-rueckwand', null, 'de', '{partner}', '{}', 'evergreen',
 'Die Rückwand eurer Challenge Area',
$md$
Ihr könnt die Fläche eurer Challenge branden. Wir folieren dafür die Fensterscheiben hinter
der Area.

## Grafikanforderungen

- **Schutzrand:** Text, Logos und Gesichter mindestens **100 mm** von der sichtbaren Kante
  entfernt.
- **Dateiformat:** PDF/X-4.
- **Farbraum:** CMYK (ISO Coated v2).
- **Auflösung:** mindestens 62 dpi im Endformat.
- **Schriften:** eingebettet oder in Pfade umgewandelt.
- **Schutzzone:** 100 mm nach innen, **nicht** im Beschnitt enthalten.
- **Endformat:** **1610 × 2790 mm** (Breite × Höhe) — der sichtbare Rahmen.
- **Datenformat:** Endformat plus Beschnitt.

Hochladen könnt ihr eure Datei im Portal unter **Hackathon**; dort steht auch die Frist.
$md$, 'draft', 60)

on conflict do nothing;

select harden_definer_functions();

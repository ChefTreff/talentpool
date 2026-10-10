import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { aktiveBuchungen, BUCHUNG_ARTEN, waehleBuchung } from "@/app/(speaker)/speaker/travel/buchung";

/**
 * SPK-086 (Feedbackrunde Konrad und Paulina 05.10.2026; Konrad: „die Reihenfolge Hotel und Übernachtung und deine Buchung ergibt so wenig Sinn. Würde wahrscheinlich
 * eine Auswahl machen: Shuttlebuchung, Hotelbuchung und dann … alle Buchungen zusammengefasst von Shuttle und Hotel“): auf `/speaker/travel` bilden Shuttle und Hotel einen
 * Abschnitt „Buchungen“ — oben die **Auswahl** (Reiter), darunter das **Angebot** der gewählten Art, ganz unten **Deine Buchungen** mit Fahrten und Hotel in einer Liste.
 * **Keine Datenbankänderung.** `ShuttleView` und `TravelView` teilen sich dafür in `teil="angebot"` und `teil="buchungen"`; Sperre, Einwilligung und Wartelisten bleiben
 * (ihre Tests laufen weiter). Der Test führt die Regeln aus und hält fest, wie die Seite und die beiden Ansichten zusammengesetzt sind.
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const SEITE = "app/(speaker)/speaker/travel/page.tsx";
const SHUTTLE = "app/(speaker)/speaker/travel/ShuttleView.tsx";
const HOTEL = "app/(speaker)/speaker/travel/TravelView.tsx";
const ANREISE = "app/(speaker)/speaker/travel/Anreise.tsx";

/** Die frühe Rückgabe `if (teil === "buchungen") { … }` einer Ansicht und alles danach (das Angebot). */
function teile(q: string): { buchungen: string; angebot: string } {
  const von = q.indexOf('  if (teil === "buchungen") {');
  assert.ok(von > 0, 'frühe Rückgabe für teil="buchungen" fehlt');
  const bis = q.indexOf("\n  }\n", von);
  assert.ok(bis > von, "Ende der frühen Rückgabe nicht gefunden");
  return { buchungen: q.slice(von, bis), angebot: q.slice(bis) };
}

describe("SPK-086: welche Art die Seite zeigt (ausgeführt)", () => {
  it("zwei Arten, das Shuttle zuerst", () => {
    assert.deepEqual([...BUCHUNG_ARTEN], ["shuttle", "hotel"]);
  });

  it("`?buchung=hotel` zeigt das Hotel — nur, wenn es angeboten wird", () => {
    assert.equal(waehleBuchung("hotel", true), "hotel");
    assert.equal(waehleBuchung("hotel", false), "shuttle");
  });

  it("ohne Angabe, mit einem unbekannten, leeren oder doppelten Wert gilt das Shuttle (das haben alle Speaker)", () => {
    for (const hotelAngeboten of [true, false]) {
      assert.equal(waehleBuchung(undefined, hotelAngeboten), "shuttle");
      assert.equal(waehleBuchung("shuttle", hotelAngeboten), "shuttle");
      assert.equal(waehleBuchung("", hotelAngeboten), "shuttle");
      assert.equal(waehleBuchung("zimmer", hotelAngeboten), "shuttle");
      assert.equal(waehleBuchung("HOTEL", hotelAngeboten), "shuttle");
      assert.equal(waehleBuchung(["hotel", "hotel"], hotelAngeboten), "shuttle");
    }
  });
});

describe("SPK-086: wie viele Buchungen gelten (ausgeführt)", () => {
  it("alles außer „storniert“ zählt, beide Listen zusammen", () => {
    const fahrten = [{ status: "requested" }, { status: "confirmed" }, { status: "cancelled" }];
    const hotel = [{ status: "requested" }, { status: "cancelled" }, { status: "cancelled" }];
    assert.deepEqual(aktiveBuchungen(fahrten, hotel), { fahrten: 2, hotel: 1, gesamt: 3 });
  });

  it("ein Hotel allein hält die Liste „Deine Buchungen“ gefüllt (sonst stünde „Noch keine Buchungen“ über einem gebuchten Zimmer)", () => {
    assert.equal(aktiveBuchungen([], [{ status: "confirmed" }]).gesamt, 1);
    assert.equal(aktiveBuchungen([{ status: "requested" }], []).gesamt, 1);
  });

  it("nichts gebucht, alles storniert oder gar keine Liste ⇒ null", () => {
    assert.equal(aktiveBuchungen([], []).gesamt, 0);
    assert.equal(aktiveBuchungen([{ status: "cancelled" }], [{ status: "cancelled" }]).gesamt, 0);
  });
});

describe("SPK-086: die Seite", () => {
  it("ein Abschnitt „Buchungen“ ersetzt die Abschnitte Shuttle und Hotel — in der Übersicht und als Anker", () => {
    const q = quelle(SEITE);
    assert.match(q, /\{ id: "anfahrt", label: t\.speaker\.arrivalTitle \},\s*\{ id: "anreise", label: t\.speaker\.sectionArrival \},\s*\{ id: "buchungen", label: t\.speaker\.sectionBookings \},\s*\];/);
    assert.match(q, /<Sektion id="buchungen" className="mb-6">/);
    assert.doesNotMatch(q, /<Sektion id="shuttle"/);
    assert.doesNotMatch(q, /<Sektion id="hotel"/);
    assert.doesNotMatch(q, /sectionHotel|sectionShuttle/);
  });

  it("die Reihenfolge im Abschnitt: erst die Auswahl, dann das Angebot der gewählten Art, dann „Deine Buchungen“", () => {
    const q = quelle(SEITE);
    const abschnitt = q.slice(q.indexOf('<Sektion id="buchungen"'));
    const auswahl = abschnitt.indexOf("<SectionTabs");
    const angebot = abschnitt.indexOf('{gewaehlt === "hotel" ? hotelAnsicht("angebot") : shuttleAnsicht("angebot")}');
    const buchungen = abschnitt.indexOf('<h2 id="h-buchungen" className="ct-h2 text-ink">');
    assert.ok(auswahl > 0 && angebot > auswahl && buchungen > angebot, "Auswahl, Angebot, Buchungen");
    assert.match(abschnitt, /\{t\.speaker\.myBookings\}/);
  });

  it("die Auswahl gibt es nur mit Hotel; zwei Reiter über die Adresse, die Seite bleibt, wo sie ist", () => {
    const q = quelle(SEITE);
    assert.match(q, /\{zeigtHotel && \(\s*<SectionTabs\s+label=\{t\.speaker\.bookChoose\}/);
    assert.match(q, /\{ href: "\?buchung=shuttle", label: t\.speaker\.tabShuttle, aktiv: gewaehlt === "shuttle", scroll: false \}/);
    assert.match(q, /\{ href: "\?buchung=hotel", label: t\.speaker\.tabHotel, aktiv: gewaehlt === "hotel", scroll: false \}/);
    assert.match(q, /const \{ buchung \} = await searchParams;/);
    assert.match(q, /const gewaehlt = waehleBuchung\(buchung, zeigtHotel\);/);
  });

  it("„Deine Buchungen“: beide Listen untereinander, das Hotel nur mit Anspruch; ohne Buchung ein Satz statt zweier leerer Listen", () => {
    const q = quelle(SEITE);
    assert.match(q, /\{anzahl\.gesamt === 0 \? \(\s*<Card className="p-4">\s*<p className="ct-help">\{t\.speaker\.bookingsNone\}<\/p>/);
    assert.match(q, /\{shuttleAnsicht\("buchungen"\)\}\s*\{zeigtHotel && hotelAnsicht\("buchungen"\)\}/);
    assert.match(q, /const anzahl = aktiveBuchungen\(\s*\(shuttleRows \?\? \[\]\) as ShuttleBooking\[\],\s*zeigtHotel \? \(\(bookingRows \?\? \[\]\) as HospitalityBooking\[\]\) : \[\],\s*\);/);
  });

  it("beide Teile jeder Ansicht bekommen dieselben Angaben — an einer Stelle beschrieben, mit Sperre und stellvertretender Einwilligung", () => {
    const q = quelle(SEITE);
    assert.equal((q.match(/<ShuttleView\s/g) ?? []).length, 1);
    assert.equal((q.match(/<TravelView\s/g) ?? []).length, 1);
    assert.match(q, /const shuttleAnsicht = \(teil: BuchungsTeil\) => \(\s*<ShuttleView\s+teil=\{teil\}/);
    assert.match(q, /const hotelAnsicht = \(teil: BuchungsTeil\) => \(\s*<TravelView\s+teil=\{teil\}/);
    assert.match(q, /<ShuttleView[\s\S]*?sperre=\{sperre\}/);
    assert.match(q, /consentOnBehalf=\{stellvertretend === true\}/);
  });

  it("der Link in der Anreise wählt das Shuttle und springt zum Abschnitt (der alte Anker `#shuttle` gibt es nicht mehr)", () => {
    const q = quelle(ANREISE);
    assert.match(q, /<ButtonLink href="\?buchung=shuttle#buchungen" variant="secondary" size="sm">/);
    assert.doesNotMatch(q, /href="#shuttle"/);
  });
});

describe("SPK-086: die beiden Ansichten", () => {
  it("Shuttle: die frühe Rückgabe trägt nur die Fahrten und das Stornieren — kein Formular, keine Überschrift „Fahrt anfordern“", () => {
    const { buchungen } = teile(quelle(SHUTTLE));
    assert.match(buchungen, /\{aktiv\.length > 0 && \(\s*<ul className="flex flex-col gap-3">/);
    assert.match(buchungen, /\{askCancel && \(\s*<ConfirmDialog/);
    assert.match(buchungen, /<p className="ct-eyebrow text-muted">\{t\.sectionShuttle\}<\/p>/);
    assert.match(buchungen, /\{!gesperrt && \(\s*<Button/);
    assert.doesNotMatch(buchungen, /SHUTTLE_FIELDS|onSubmit|shuttleAdd|<section/);
  });

  it("Shuttle: das Angebot trägt Überschrift, „Fahrt anfordern“, Sperr-Hinweis und Formular — keine Karten, keinen Stornieren-Dialog", () => {
    const { angebot } = teile(quelle(SHUTTLE));
    assert.match(angebot, /<section aria-labelledby="h-shuttle" className="flex flex-col gap-3">/);
    assert.match(angebot, /\{t\.shuttleAdd\}/);
    assert.match(angebot, /\{gesperrt && sperre && <SperreHinweis/);
    assert.match(angebot, /SHUTTLE_FIELDS\.map/);
    assert.doesNotMatch(angebot, /aktiv\.map|askCancel &&|shuttleCancelTitle/);
  });

  it("Hotel: die frühe Rückgabe trägt nur die Zimmer-Karten (mit Art) und das Stornieren — keine Zimmerliste, keine Einwilligung", () => {
    const { buchungen } = teile(quelle(HOTEL));
    assert.match(buchungen, /\{active\.length > 0 && \(\s*<ul className="flex flex-col gap-3">/);
    assert.match(buchungen, /<p className="ct-eyebrow text-muted">\{t\[`kind_\$\{b\.kind\}`\] \?\? b\.kind\}<\/p>/);
    assert.match(buchungen, /\{askCancel && \(\s*<ConfirmDialog/);
    assert.doesNotMatch(buchungen, /options\.map|askConsent|blockReason|h-options|h-bookings/);
  });

  it("Hotel: das Angebot trägt die Hinweise zur Freischaltung, die Zimmerliste und die Einwilligung — keine Buchungskarten, keine eigene Überschrift „Deine Buchungen“", () => {
    const { angebot } = teile(quelle(HOTEL));
    assert.match(angebot, /blockReason === "status"/);
    assert.match(angebot, /<section aria-labelledby="h-options">/);
    assert.match(angebot, /options\.map/);
    assert.match(angebot, /\{askConsent && \(\s*<ConfirmDialog/);
    assert.doesNotMatch(angebot, /active\.map|h-bookings|askCancel &&|t\.myBookings/);
  });

  it("beide Ansichten verlangen `teil` — es gibt keinen Aufruf mehr, der Angebot und Buchungen in der alten Reihenfolge zusammen zeichnet", () => {
    for (const datei of [SHUTTLE, HOTEL]) {
      const q = quelle(datei);
      assert.match(q, /\n {2}teil: BuchungsTeil;\n/);
      assert.match(q, /import type \{ BuchungsTeil \} from "\.\/buchung";/);
    }
  });
});

describe("SPK-086: Texte DE und EN", () => {
  type Woerterbuch = { speaker: Record<string, string> };
  const de = JSON.parse(quelle("lib/i18n/de.json")) as Woerterbuch;
  const en = JSON.parse(quelle("lib/i18n/en.json")) as Woerterbuch;

  it("die fünf neuen Schlüssel haben in beiden Sprachen einen Text; „Deine Buchungen“ bleibt", () => {
    for (const w of [de, en]) {
      for (const k of ["sectionBookings", "bookChoose", "tabShuttle", "tabHotel", "bookingsNone", "myBookings"]) assert.ok(w.speaker[k]?.trim(), k);
    }
    assert.equal(de.speaker.myBookings, "Deine Buchungen");
    assert.equal(de.speaker.sectionBookings, "Buchungen");
    assert.equal(de.speaker.tabHotel, "Hotel");
    assert.equal(en.speaker.bookingsNone, "No bookings yet.");
  });
});

describe("SPK-086: Doku", () => {
  it("Testleitfaden: die Zeile `/speaker/travel` beschreibt Auswahl, Angebot und „Deine Buchungen“ in einer Liste", () => {
    const zeile = quelle("docs/team-testleitfaden.md")
      .split("\n")
      .find((l) => l.startsWith("| `/speaker/travel` Anreise |"));
    assert.ok(zeile, "Zeile fehlt");
    assert.match(zeile, /\*\*Abschnitt „Buchungen“ \(SPK-086\):\*\* oben die \*\*Auswahl Shuttle \| Hotel\*\*/);
    assert.match(zeile, /Fahrten und Hotel \*\*in einer Liste\*\*/);
    assert.match(zeile, /Die Auswahl und der Reiter „Hotel“ erscheinen nur mit Hotel-Anspruch/);
  });

  it("Backlog: SPK-086 trägt die PR-Nummer und sagt „keine Migration“, den Anker und den Admin-Weg", () => {
    const zeile = quelle("docs/feedback/speaker.md")
      .split("\n")
      .find((l) => l.startsWith("| SPK-086 |"));
    assert.ok(zeile && /\| P2 \| (geplant|gebaut|abgenommen) #\d+/.test(zeile), "SPK-086 trägt keine PR-Nummer");
    assert.match(zeile, /keine Migration/);
    assert.match(zeile, /`teil="angebot"` und `teil="buchungen"`/);
    assert.match(zeile, /`\?buchung=shuttle#buchungen`/);
    assert.match(zeile, /`\/admin\/hospitality`/);
  });
});

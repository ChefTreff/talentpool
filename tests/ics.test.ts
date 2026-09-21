import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { icsCalendar, icsFileName } from "@/lib/ics";

const START = new Date("2027-04-16T07:30:00.000Z");
const ENDE = new Date("2027-04-16T08:00:00.000Z");
const JETZT = new Date("2026-09-21T10:00:00.000Z");

function zeilen(ics: string): string[] {
  return ics.split("\r\n");
}

/** Gefaltete Zeilen wieder zusammensetzen, wie ein Kalender es täte. */
function entfalten(ics: string): string[] {
  const raus: string[] = [];
  for (const z of zeilen(ics)) {
    if (z.startsWith(" ") && raus.length > 0) raus[raus.length - 1] += z.slice(1);
    else raus.push(z);
  }
  return raus;
}

describe("ICS: Rahmen", () => {
  it("steht in CRLF und endet mit einem Zeilenumbruch", () => {
    const ics = icsCalendar([{ uid: "a@x", start: START, summary: "Talk" }], { now: JETZT });
    assert.ok(ics.endsWith("\r\n"));
    assert.ok(!/[^\r]\n/.test(ics), "es gibt ein LF ohne vorangehendes CR");
  });

  it("trägt Version, PRODID und METHOD:PUBLISH", () => {
    const z = zeilen(icsCalendar([], { now: JETZT }));
    assert.equal(z[0], "BEGIN:VCALENDAR");
    assert.ok(z.includes("VERSION:2.0"));
    assert.ok(z.some((l) => l.startsWith("PRODID:")));
    // REQUEST wäre eine Einladung mit Zu- und Absage; hier gibt es nichts zu
    // beantworten (SPK-014).
    assert.ok(z.includes("METHOD:PUBLISH"));
    assert.equal(z[z.length - 2], "END:VCALENDAR");
  });
});

describe("ICS: Zeiten", () => {
  it("schreibt UTC im Basisformat", () => {
    const z = zeilen(icsCalendar([{ uid: "a@x", start: START, end: ENDE, summary: "Talk" }], { now: JETZT }));
    assert.ok(z.includes("DTSTART:20270416T073000Z"));
    assert.ok(z.includes("DTEND:20270416T080000Z"));
    assert.ok(z.includes("DTSTAMP:20260921T100000Z"));
  });

  it("lässt DTEND weg, wenn kein Ende bekannt ist", () => {
    // Lieber null Minuten als eine erfundene Dauer: die Reception hat nicht
    // immer ein `ends_at`, und eine geratene Stunde stünde falsch im Kalender.
    const z = zeilen(icsCalendar([{ uid: "a@x", start: START, summary: "Reception" }], { now: JETZT }));
    assert.ok(z.includes("DTSTART:20270416T073000Z"));
    assert.ok(!z.some((l) => l.startsWith("DTEND")));
  });
});

describe("ICS: Maskierung", () => {
  it("maskiert Komma, Semikolon, Backslash und Umbruch im Text", () => {
    const ics = icsCalendar(
      [
        {
          uid: "a@x",
          start: START,
          summary: "Führung, Vertrauen; Tempo",
          description: "Erste Zeile\nZweite Zeile",
          location: "Halle A\\B",
        },
      ],
      { now: JETZT },
    );
    const z = entfalten(ics);
    // Ohne Maskierung zerfiele der Titel am Komma in mehrere Werte, und der
    // Kalender zeigte nur „Führung".
    assert.ok(z.includes("SUMMARY:Führung\\, Vertrauen\\; Tempo"));
    assert.ok(z.includes("DESCRIPTION:Erste Zeile\\nZweite Zeile"));
    assert.ok(z.includes("LOCATION:Halle A\\\\B"));
  });

  it("maskiert die URL nicht — sie ist ein URI, kein TEXT", () => {
    const z = entfalten(
      icsCalendar([{ uid: "a@x", start: START, summary: "Talk", url: "https://p.example/a,b" }], {
        now: JETZT,
      }),
    );
    assert.ok(z.includes("URL:https://p.example/a,b"));
  });
});

describe("ICS: Faltung", () => {
  it("bricht bei 75 Oktetten um, nicht bei 75 Zeichen", () => {
    // Lauter Umlaute: 2 Bytes je Zeichen. Wer Zeichen zählt, liefert Zeilen
    // mit weit über 75 Oktetten aus, und strenge Parser weisen die Datei ab.
    const titel = "ü".repeat(120);
    const ics = icsCalendar([{ uid: "a@x", start: START, summary: titel }], { now: JETZT });
    const enc = new TextEncoder();
    for (const z of zeilen(ics)) {
      assert.ok(enc.encode(z).length <= 75, `Zeile zu lang: ${enc.encode(z).length} Oktette`);
    }
    // Und zusammengesetzt steht wieder der ganze Titel da.
    assert.ok(entfalten(ics).includes(`SUMMARY:${titel}`));
  });

  it("zerschneidet kein Mehrbyte-Zeichen", () => {
    const ics = icsCalendar([{ uid: "a@x", start: START, summary: "ä".repeat(200) }], { now: JETZT });
    assert.ok(!ics.includes("�"), "es ist ein Ersatzzeichen entstanden");
    assert.equal(entfalten(ics).find((l) => l.startsWith("SUMMARY:")), `SUMMARY:${"ä".repeat(200)}`);
  });

  it("lässt kurze Zeilen in Ruhe", () => {
    const z = zeilen(icsCalendar([{ uid: "a@x", start: START, summary: "Talk" }], { now: JETZT }));
    assert.ok(z.includes("SUMMARY:Talk"));
  });
});

describe("ICS: UID", () => {
  it("übernimmt die UID unverändert, damit ein zweiter Download nicht doppelt anlegt", () => {
    const eins = icsCalendar([{ uid: "slot-42@portal", start: START, summary: "Talk" }], { now: JETZT });
    const zwei = icsCalendar([{ uid: "slot-42@portal", start: START, summary: "Talk" }], {
      now: new Date("2026-09-22T10:00:00.000Z"),
    });
    assert.ok(entfalten(eins).includes("UID:slot-42@portal"));
    assert.ok(entfalten(zwei).includes("UID:slot-42@portal"));
  });
});

describe("ICS: Dateiname", () => {
  it("macht aus einem Titel einen harmlosen Dateinamen", () => {
    assert.equal(icsFileName("Führung, Vertrauen & Tempo"), "fuhrung-vertrauen-tempo.ics");
    assert.equal(icsFileName("  "), "termine.ics");
    assert.equal(icsFileName("FLS27"), "fls27.ics");
  });
});

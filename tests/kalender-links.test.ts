import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { googleKalenderUrl, outlookKalenderUrl } from "@/lib/kalender-links";

const SLOT = {
  titel: "Führung, Vertrauen & Tempo",
  start: new Date("2027-04-16T07:30:00.000Z"),
  ende: new Date("2027-04-16T08:00:00.000Z"),
  ort: "Main Stage, CCH",
};

const TAGE = {
  titel: "Future Leaders Summit 27",
  start: new Date("2027-04-16T00:00:00.000Z"),
  ende: new Date("2027-04-17T00:00:00.000Z"),
  ganztaegig: true,
};

function abfrage(url: string): URLSearchParams {
  return new URL(url).searchParams;
}

describe("Kalenderlinks: Google", () => {
  it("setzt Titel, Spanne und Ort", () => {
    const p = abfrage(googleKalenderUrl(SLOT));
    assert.equal(p.get("action"), "TEMPLATE");
    assert.equal(p.get("text"), SLOT.titel);
    assert.equal(p.get("dates"), "20270416T073000Z/20270416T080000Z");
    assert.equal(p.get("location"), "Main Stage, CCH");
  });

  it("rechnet bei ganztägig auf Datum und ein **exklusives** Ende", () => {
    // Der 16. bis 17. April sind zwei Tage; Google will den 18. als Ende.
    // Ohne das fiele der zweite Summit-Tag aus dem Kalender.
    assert.equal(abfrage(googleKalenderUrl(TAGE)).get("dates"), "20270416/20270418");
  });

  it("nimmt ohne Ende den Start — lieber null Minuten als eine geratene Stunde", () => {
    const p = abfrage(googleKalenderUrl({ titel: "Reception", start: SLOT.start }));
    assert.equal(p.get("dates"), "20270416T073000Z/20270416T073000Z");
  });

  it("maskiert Sonderzeichen im Titel", () => {
    // Das Kaufmanns-Und im Titel darf die Abfrage nicht zerlegen. Auf „Tempo&"
    // zu prüfen wäre falsch: das `&` danach trennt die Parameter. Es zählt,
    // dass das Zeichen **aus dem Titel** maskiert ankommt und die folgenden
    // Parameter noch dastehen.
    const url = googleKalenderUrl(SLOT);
    assert.ok(url.includes("%26"), "das Und aus dem Titel steht unmaskiert in der Adresse");
    assert.equal(abfrage(url).get("text"), SLOT.titel);
    assert.equal(abfrage(url).get("dates"), "20270416T073000Z/20270416T080000Z");
  });
});

describe("Kalenderlinks: Outlook", () => {
  it("setzt den Compose-Pfad, Betreff und ISO-Zeiten", () => {
    const p = abfrage(outlookKalenderUrl(SLOT));
    assert.equal(p.get("path"), "/calendar/action/compose");
    assert.equal(p.get("rru"), "addevent");
    assert.equal(p.get("subject"), SLOT.titel);
    assert.equal(p.get("startdt"), "2027-04-16T07:30:00.000Z");
    assert.equal(p.get("enddt"), "2027-04-16T08:00:00.000Z");
    assert.equal(p.get("allday"), null);
  });

  it("schreibt bei ganztägig nur Datumsteile und setzt allday", () => {
    const p = abfrage(outlookKalenderUrl(TAGE));
    assert.equal(p.get("allday"), "true");
    assert.equal(p.get("startdt"), "2027-04-16");
    assert.equal(p.get("enddt"), "2027-04-18");
  });
});

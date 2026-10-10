import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * SPK-096 (Befund des Speaker-Chats bei der Sichtprüfung von SPK-082, 10.10.2026): hat ein Punkt der Checkliste auf `/speaker` eine Frist, drückte die Marke
 * („Frist: 14.10.2026 · noch 3 Tage“, 179 px, `shrink-0`) Titel und Beschreibung bei 375 px auf **86 px** — die Präsentation 213 px hoch statt 89, ein Punkt mit
 * längerem Text 349. Der Umbruch der Zeile (`flex-wrap`) griff nie, weil die Textspalte `flex-1` (Basis 0) hatte. Jetzt stehen Text und Frist in **einer Spalte**:
 * am Handy untereinander (Frist unter dem Text, bündig mit ihm), ab 640 px nebeneinander. Gemessen im Browser: Textspalte 277 statt 86 px, Zeile 113 statt 213 px.
 * Die Verdrahtung wird am Quelltext geprüft — Komponenten lädt der Testlader nicht.
 */
const lies = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const ohneKommentare = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

describe("SPK-096: Text und Frist der Checkliste-Zeile", () => {
  const c = ohneKommentare(lies("app/(speaker)/speaker/Checkliste.tsx"));
  const zeile = c.slice(c.indexOf("<li"), c.indexOf("</li>"));

  it("die Zeile hat kein `flex-wrap` mehr — der Umbruch, der nie griff, ist durch die Spalte ersetzt", () => {
    assert.match(zeile, /className="flex min-h-14 items-center gap-3 border-b px-4 py-3 last:border-b-0"/);
    assert.doesNotMatch(zeile, /min-h-14 flex-wrap/);
  });

  it("Text und Frist stehen in einer Spalte: am Handy untereinander, ab 640 px in einer Reihe", () => {
    assert.match(zeile, /<div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">/);
  });

  it("die Frist schrumpft nicht mehr, wo sie in der Reihe steht (`sm:shrink-0`) — am Handy ist sie Teil der Spalte und bricht nach Bedarf um", () => {
    assert.match(zeile, /<span className="ct-help tabular-nums sm:shrink-0">/);
    assert.doesNotMatch(zeile, /ct-help shrink-0 tabular-nums/, "das alte, immer starre `shrink-0` presste die Textspalte zusammen");
  });

  it("die Frist steht nach dem Text — am Handy also darunter, nicht darüber", () => {
    assert.ok(zeile.indexOf('<div className="min-w-0 flex-1">') > 0, "der Textblock fehlt");
    assert.ok(zeile.indexOf('<span className="ct-help tabular-nums sm:shrink-0">') > zeile.indexOf('<div className="min-w-0 flex-1">'), "die Frist steht vor dem Text");
  });

  it("keine feste Breite und kein roher Pixelwert (Skill, Regel 2): die Spalte regelt der Fluss", () => {
    assert.doesNotMatch(zeile, /\b(?:min-w|max-w|w|basis)-\[|\[\d+px\]/);
  });

  it("der Haken, Titel, Beschreibung und der Hinweis „wieder geöffnet“ bleiben im Textblock (SPK-082)", () => {
    const text = zeile.slice(zeile.indexOf('<div className="min-w-0 flex-1">'), zeile.indexOf('<span className="ct-help tabular-nums sm:shrink-0">'));
    assert.match(text, /\{a\.titel\}/);
    assert.match(text, /\{a\.beschreibung\}/);
    assert.match(text, /\{a\.wiederGeoeffnet && <p className="ct-help">\{t\.reopenedHint\}<\/p>\}/);
    assert.ok(zeile.indexOf("<HakenSchalter") < zeile.indexOf('<div className="flex min-w-0 flex-1 flex-col'), "der Haken steht vor der Spalte");
  });
});

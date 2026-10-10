import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { scrolltNachRueckfrage, zielBeiKlick } from "@/components/ui/ungesichert";

/**
 * QS-051: welche Klicks die Warnung vor ungesicherten Änderungen abfängt —
 * nur, was die Seite im selben Fenster verlässt.
 */
const ORT = { href: "https://portal.chef-treff.de/speaker/profil?x=1", origin: "https://portal.chef-treff.de", pathname: "/speaker/profil", search: "?x=1" };
const LINKS = { button: 0, meta: false, ctrl: false, shift: false, alt: false };
const link = (href: string, x: Partial<{ target: string; download: boolean }> = {}) => ({ href, target: "", download: false, ...x });

describe("Ungesicherte Änderungen: welche Klicks gefragt werden (QS-051)", () => {
  it("fängt Links auf andere Seiten im Portal ab — mit Suche und Anker", () => {
    assert.equal(zielBeiKlick(link("/speaker/travel"), ORT, LINKS), "/speaker/travel");
    assert.equal(zielBeiKlick(link("https://portal.chef-treff.de/speaker?tab=a#b"), ORT, LINKS), "/speaker?tab=a#b");
    assert.equal(zielBeiKlick(link("/speaker/profil?x=2"), ORT, LINKS), "/speaker/profil?x=2", "andere Suche = andere Ansicht");
  });

  it("lässt durch, was nichts verliert: Anker auf derselben Seite, neues Fenster, Download, Tasten", () => {
    assert.equal(zielBeiKlick(link("/speaker/profil?x=1#bio"), ORT, LINKS), null);
    assert.equal(zielBeiKlick(link("/speaker/travel", { target: "_blank" }), ORT, LINKS), null);
    assert.equal(zielBeiKlick(link("/api/export.csv", { download: true }), ORT, LINKS), null);
    assert.equal(zielBeiKlick(link("/speaker/travel"), ORT, { ...LINKS, meta: true }), null, "Cmd-Klick");
    assert.equal(zielBeiKlick(link("/speaker/travel"), ORT, { ...LINKS, ctrl: true }), null, "Strg-Klick");
    assert.equal(zielBeiKlick(link("/speaker/travel"), ORT, { ...LINKS, button: 1 }), null, "mittlere Taste");
  });

  it("lässt fremde Seiten dem Browser-Dialog (beforeunload)", () => {
    assert.equal(zielBeiKlick(link("https://www.chef-treff.de"), ORT, LINKS), null);
  });

  it("_self zählt wie kein Ziel", () => {
    assert.equal(zielBeiKlick(link("/speaker/travel", { target: "_self" }), ORT, LINKS), "/speaker/travel");
  });
});

/**
 * Design 10.10.2026 (Partner-Hinweis zu #468): „Seite verlassen“ ging mit `router.push(ziel)` — der Router kennt das `scroll={false}` des Links nicht und
 * sprang nach oben (3186 → 0 gemessen), obwohl der Klick selbst die Seite ließ. Ein Wechsel auf derselben Seite lässt sie jetzt stehen.
 */
describe("Ungesicherte Änderungen: scrollt die Seite nach der Rückfrage?", () => {
  it("derselbe Pfad, andere Abfrage (Umschalter, Reiter über die Adresszeile): die Seite bleibt stehen", () => {
    assert.equal(scrolltNachRueckfrage("/speaker/profil?x=2", ORT), false);
    assert.equal(scrolltNachRueckfrage("/speaker/profil?instanz=s2", ORT), false);
    assert.equal(scrolltNachRueckfrage("/speaker/profil", ORT), false, "ohne Abfrage ist es derselbe Pfad");
  });

  it("jede andere Seite behält den Standard: oben beginnen", () => {
    assert.equal(scrolltNachRueckfrage("/speaker/travel", ORT), true);
    assert.equal(scrolltNachRueckfrage("/speaker/travel?x=1", ORT), true, "gleiche Abfrage, anderer Pfad");
    assert.equal(scrolltNachRueckfrage("/speaker/profil/neu", ORT), true, "ein Pfad darunter ist eine andere Seite");
  });

  it("ein Anker im Ziel behält den Standard — nur so springt Next zum Abschnitt", () => {
    assert.equal(scrolltNachRueckfrage("/speaker/profil?x=2#bio", ORT), true);
  });

  it("zusammen mit der Abfangregel: ein Klick auf den Reiter derselben Seite scrollt nicht, einer auf eine andere Seite schon", () => {
    const ziel = (href: string) => zielBeiKlick(link(href), ORT, LINKS) ?? "";
    assert.equal(scrolltNachRueckfrage(ziel("/speaker/profil?x=2"), ORT), false);
    assert.equal(scrolltNachRueckfrage(ziel("/speaker/travel"), ORT), true);
  });

  it("der Hook übergibt die Regel an den Router — ein blankes `router.push(ziel)` brächte den Sprung nach oben zurück", () => {
    const hook = readFileSync(new URL("../components/ui/useUngesichert.tsx", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    assert.match(hook, /router\.push\(ziel, \{ scroll: scrolltNachRueckfrage\(ziel, window\.location\) \}\)/);
    assert.doesNotMatch(hook, /router\.push\(ziel\)/);
  });
});

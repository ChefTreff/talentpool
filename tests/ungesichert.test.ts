import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { zielBeiKlick } from "@/components/ui/ungesichert";

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

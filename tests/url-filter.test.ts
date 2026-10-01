import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { ausAdresse, neueSuche } from "@/components/ui/url-filter";

/**
 * QS-050: Filter einer Liste in der Adresszeile. Geprüft werden die reinen
 * Funktionen hinter `useUrlFilter` — wie Werte gelesen und geschrieben werden.
 */
const VORGABEN = { status: "", query: "", sort: "time", gaeste: "" };
const NAMEN = { query: "q" } as const;

describe("Filter in der Adresszeile (QS-050)", () => {
  it("liest Werte aus der Adresse, sonst die Vorgaben — auch mit kurzem Namen", () => {
    const p = new URLSearchParams("status=confirmed&q=Anna&event=summit-27");
    assert.deepEqual(ausAdresse(p, VORGABEN, NAMEN), { status: "confirmed", query: "Anna", sort: "time", gaeste: "" });
  });

  it("schreibt nur, was von der Vorgabe abweicht, und lässt fremde Parameter stehen", () => {
    assert.equal(neueSuche("event=summit-27", { status: "lead" }, VORGABEN, NAMEN), "event=summit-27&status=lead");
    assert.equal(neueSuche("event=summit-27&status=lead", { status: "" }, VORGABEN, NAMEN), "event=summit-27");
    assert.equal(neueSuche("sort=-title", { sort: "time" }, VORGABEN, NAMEN), "", "Vorgabe = keine Angabe");
  });

  it("schreibt Suche unter dem kurzen Namen und kodiert Sonderzeichen", () => {
    assert.equal(neueSuche("", { query: "Müller & Co" }, VORGABEN, NAMEN), "q=M%C3%BCller+%26+Co");
    assert.deepEqual(ausAdresse(new URLSearchParams("q=M%C3%BCller+%26+Co"), VORGABEN, NAMEN).query, "Müller & Co");
  });

  it("Schalter: „1“ an, fehlt aus; unveränderte Felder bleiben unberührt", () => {
    assert.equal(neueSuche("status=lead", { gaeste: "1" }, VORGABEN, NAMEN), "status=lead&gaeste=1");
    assert.equal(neueSuche("status=lead&gaeste=1", { gaeste: "" }, VORGABEN, NAMEN), "status=lead");
    assert.equal(neueSuche("status=lead", {}, VORGABEN, NAMEN), "status=lead");
  });
});

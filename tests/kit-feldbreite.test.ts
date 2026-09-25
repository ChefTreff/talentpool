import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { feldBreite } from "@/components/ui/cn";

/**
 * Kit-Felder (`Input`, `Select`, `Textarea`) sind voll breit — ausser der
 * Aufrufer setzt eine eigene Breite. `cn` fügt Klassen nur aneinander, und bei
 * `w-full w-44` gewann im erzeugten CSS `w-full`: Filterzeilen standen
 * untereinander (LEAD-049, gemessen 25.09.).
 */
describe("Breite der Kit-Felder", () => {
  it("ohne eigene Breite: volle Breite", () => {
    assert.equal(feldBreite(undefined), "w-full");
    assert.equal(feldBreite(""), "w-full");
    assert.equal(feldBreite("mt-1 uppercase"), "w-full");
  });

  it("mit eigener Breite: kein w-full daneben", () => {
    assert.equal(feldBreite("w-44"), false);
    assert.equal(feldBreite("mt-1 w-48"), false);
    assert.equal(feldBreite("w-full min-w-48"), false);
  });

  it("Mindest-, Höchst- und Varianten-Breiten zählen nicht als eigene Breite", () => {
    assert.equal(feldBreite("min-w-48"), "w-full");
    assert.equal(feldBreite("max-w-72"), "w-full");
    // `sm:w-44` steht in einer Media-Query und setzt sich ab `sm` selbst durch.
    assert.equal(feldBreite("sm:w-44"), "w-full");
  });
});

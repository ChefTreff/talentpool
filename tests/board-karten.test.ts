import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { zeilenInKarte } from "@/components/programme/geometry";
import { PARTNER_KARTE, PARTNER_LEGENDE } from "@/components/programme/partnerSicht";
import { KARTE_NEUTRAL, SLOT_STATUS_ORDER, SLOT_STATUS_STYLE, type KartenStil } from "@/components/programme/types";

/**
 * LEAD-017 (Kalender moderner, Farben am CI): zwei Regeln der Karte, die man
 * auf dem Bildschirm nicht sofort sieht — der Status ist auch **ohne Farbe**
 * zu unterscheiden (Design-Regel 4), und die Karte zeigt nur so viele Zeilen,
 * wie ganz hineinpassen.
 */

/** Die Form einer Karte ohne ihre Farbe: Strichelung, Leiste, Schraffur, Vollfläche, Durchstreichung. */
function form(stil: KartenStil): string {
  const f = stil.flaeche.split(/\s+/);
  return [
    f.includes("border-dashed") && "gestrichelt",
    f.includes("border-l-4") && "leiste",
    f.some((k) => k.startsWith("bg-hatch-")) && "schraffur",
    f.includes("bg-accent") && "vollflaeche",
    stil.durchgestrichen && "durchgestrichen",
  ]
    .filter(Boolean)
    .join("+");
}

describe("Board-Karten (LEAD-017)", () => {
  it("jeder Slot-Status hat eine eigene Form, nicht nur eine eigene Farbe", () => {
    const formen = SLOT_STATUS_ORDER.map((s) => form(SLOT_STATUS_STYLE[s]));
    assert.equal(new Set(formen).size, SLOT_STATUS_ORDER.length, formen.join(" | "));
  });

  it("jeder Partner-Status hat eine eigene Form, und keiner sieht aus wie die neutrale Karte", () => {
    const formen = PARTNER_LEGENDE.map((s) => form(PARTNER_KARTE[s]));
    assert.equal(new Set(formen).size, PARTNER_LEGENDE.length, formen.join(" | "));
    // Fremde Bühnen der Partner-Sicht: belegt, ohne Status — dieselbe Form
    // wie „in Bearbeitung“ wäre eine Aussage, die dort niemand trifft.
    for (const s of PARTNER_LEGENDE) {
      assert.notEqual(PARTNER_KARTE[s].flaeche, KARTE_NEUTRAL.flaeche, s);
    }
  });

  it("Final und Veröffentlicht sind die volle Akzentfläche mit weisser Schrift (4,88:1)", () => {
    assert.equal(SLOT_STATUS_STYLE.final.text, "text-white");
    assert.equal(PARTNER_KARTE.veroeffentlicht, SLOT_STATUS_STYLE.final);
  });

  it("zeigt nur ganze Zeilen: 20 Minuten eine, 30 zwei, 45 drei, 60 vier", () => {
    assert.deepEqual(
      [20, 25, 30, 45, 60, 90].map((dauer) => zeilenInKarte(600, 600 + dauer)),
      [1, 1, 2, 3, 4, 6],
    );
    // Der kürzeste Slot (5 Minuten, Mindesthöhe 22 px) fasst mit Innenabstand
    // keine ganze Zeile; die einzeilige Fassung kommt ohne ihn aus und passt.
    assert.equal(zeilenInKarte(600, 605), 0);
  });
});

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { kartenPadding, kartenRand } from "@/components/ui/cn";

/**
 * QS-055: `<Card className="p-0">` blieb bei 24 px, weil `cn` Klassen nur
 * aneinanderfügt und im erzeugten CSS `p-6` hinter `p-0` steht. 74 Karten
 * setzen ein eigenes Padding. `kartenPadding` lässt das Kürzel der Karte weg,
 * sobald der Aufrufer eines mitbringt.
 */
describe("Karten-Innenabstand (QS-055)", () => {
  it("setzt p-6, wenn der Aufrufer kein Kürzel mitbringt", () => {
    assert.equal(kartenPadding(undefined), "p-6");
    assert.equal(kartenPadding(""), "p-6");
    assert.equal(kartenPadding("flex flex-col gap-4"), "p-6");
    assert.equal(kartenPadding("mb-6 scroll-mt-20 border-accent"), "p-6");
  });

  it("lässt p-6 weg, wenn der Aufrufer ein Padding-Kürzel setzt — an jeder Stelle des Strings", () => {
    for (const k of ["p-0", "p-4", "mb-6 p-4", "overflow-x-auto p-0", "flex flex-wrap gap-3 p-4", "p-4 sm:col-span-2", "p-[10px]", "!p-0", "border-accent p-0"]) {
      assert.equal(kartenPadding(k), false, k);
    }
  });

  it("lässt p-6 stehen bei Einzelseiten und Varianten, die ohnehin gewinnen", () => {
    // Tailwind sortiert px-/py-/pt-… hinter p-; Varianten stehen in einer Media-Query.
    for (const k of ["px-4", "py-2", "pt-0", "sm:p-8", "md:p-0 flex", "gap-p-4", "top-p-1"]) {
      assert.equal(kartenPadding(k), "p-6", k);
    }
  });

  it("eine randlose Karte beschneidet an der Rundung, sonst nicht", () => {
    for (const k of ["p-0", "flex flex-col gap-3 p-0", "border-accent p-0", "!p-0"]) {
      assert.equal(kartenRand(k), "overflow-hidden", k);
    }
    // Kein Beschnitt bei Padding, ohne Angabe und wo der Aufrufer selbst scrollen lässt.
    for (const k of [undefined, "", "p-4", "p-6", "px-0", "p-0x", "overflow-x-auto p-0", "p-0 overflow-visible"]) {
      assert.equal(kartenRand(k), false, String(k));
    }
  });

  it("Card nutzt es", () => {
    const datei = readFileSync("components/ui/Card.tsx", "utf8");
    // Nur die Funktion `Card` — `StatCard` in derselben Datei hat sein festes p-6 mit Absicht.
    const karte = datei.slice(datei.indexOf("export function Card("), datei.indexOf("export function CardHeader("));
    assert.ok(karte.length > 0, "Funktion Card nicht gefunden");
    assert.match(karte, /kartenPadding\(className\)/);
    assert.match(karte, /kartenRand\(className\)/);
    assert.ok(!/\bp-6\b/.test(karte.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "")), "p-6 wieder fest in der Karte");
  });
});

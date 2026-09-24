import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  WOERTERBUECHER,
  blattPfade,
  dubletten,
  formatiert,
  sortiert,
  vergleich,
  zusammenfuehren,
} from "@/scripts/i18n-werkzeug.mjs";

/**
 * QS-047: Die Wörterbücher sind alphabetisch sortiert, damit parallele PRs
 * nicht dieselbe Zeile treffen. Dieser Test hält das fest — und zwei Dinge,
 * die vorher niemand bemerkte: doppelte Schlüssel (`JSON.parse` nimmt stumm
 * den letzten) und Schlüssel, die es nur in EN gibt (`satisfies` prüft nur,
 * was fehlt). Bricht er, hilft fast immer `node scripts/i18n-sortieren.mjs`.
 */

const roh = Object.fromEntries(WOERTERBUECHER.map((d) => [d, readFileSync(d, "utf8")]));

function unsortierteObjekte(wert: unknown, pfad: string, funde: string[]): string[] {
  if (Array.isArray(wert)) {
    wert.forEach((w, i) => unsortierteObjekte(w, `${pfad}[${i}]`, funde));
  } else if (wert && typeof wert === "object") {
    const schluessel = Object.keys(wert);
    if (schluessel.join("\n") !== [...schluessel].sort(vergleich).join("\n")) funde.push(pfad || "(oberste Ebene)");
    for (const k of schluessel) unsortierteObjekte((wert as Record<string, unknown>)[k], pfad ? `${pfad}.${k}` : k, funde);
  }
  return funde;
}

describe("Wörterbücher (QS-047)", () => {
  for (const datei of WOERTERBUECHER) {
    it(`${datei}: jede Ebene nach Codepunkt sortiert`, () => {
      assert.deepEqual(unsortierteObjekte(JSON.parse(roh[datei]), "", []), [], "bitte node scripts/i18n-sortieren.mjs");
    });

    it(`${datei}: keine doppelten Schlüssel im Rohtext`, () => {
      assert.deepEqual(dubletten(roh[datei]), []);
    });

    it(`${datei}: Schreibweise — zwei Leerzeichen, Zeilenende am Schluss, kein CR`, () => {
      // Getrennt von der Sortierung: Einlesen und Zurückschreiben in derselben
      // Reihenfolge muss denselben Text ergeben.
      assert.ok(!roh[datei].includes("\r"), "Windows-Zeilenenden");
      assert.equal(roh[datei], formatiert(JSON.parse(roh[datei])));
    });
  }

  it("DE und EN haben genau dieselben Schlüssel", () => {
    const [de, en] = WOERTERBUECHER.map((d) => new Set(blattPfade(JSON.parse(roh[d]))));
    assert.deepEqual(
      { nurDe: [...de].filter((p) => !en.has(p)), nurEn: [...en].filter((p) => !de.has(p)) },
      { nurDe: [], nurEn: [] },
    );
  });
});

describe("Wörterbuch-Werkzeug", () => {
  it("vergleicht nach Codepunkt, nicht nach Sprache", () => {
    assert.ok(vergleich("Z", "a") < 0, "Grossbuchstaben vor Kleinbuchstaben");
    assert.ok(vergleich("a", "ab") < 0, "Präfix zuerst");
    assert.ok(vergleich("bandGreeting", "bandHighlight") < 0);
    assert.equal(vergleich("x", "x"), 0);
  });

  it("sortiert jede Ebene, lässt Arrays in ihrer Reihenfolge und ist idempotent", () => {
    const vorher = { b: { d: "1", c: "2" }, a: [{ z: "1", y: "2" }, { x: "3" }] };
    const einmal = sortiert(vorher);
    assert.deepEqual(Object.keys(einmal), ["a", "b"]);
    assert.deepEqual(Object.keys(einmal.b), ["c", "d"]);
    assert.deepEqual(einmal.a.map((o: Record<string, string>) => Object.keys(o)), [["y", "z"], ["x"]]);
    assert.equal(formatiert(sortiert(einmal)), formatiert(einmal));
    assert.deepEqual(einmal, vorher, "gleiche Schlüssel, gleiche Texte");
  });

  it("findet Dubletten im Rohtext mit Pfad und Zeile", () => {
    const text = '{\n  "a": {\n    "x": "1",\n    "x": "2"\n  },\n  "b": [\n    { "k": "1", "k": "2" }\n  ]\n}\n';
    assert.deepEqual(dubletten(text), [
      { pfad: "a.x", zeile: 4 },
      { pfad: "b.0.k", zeile: 7 },
    ]);
    assert.deepEqual(dubletten('{ "s": "a \\" x", "t": "{", "u": { "s": "1" } }'), [], "Anführungszeichen und Klammern in Texten");
  });

  it("führt Ergänzungen beider Seiten zusammen — der Fall, der fünf PRs kollidieren liess", () => {
    const basis = { rpc: { a: "A" }, common: { ok: "OK" } };
    const unsere = { rpc: { a: "A", partner_x: "P" }, common: { ok: "OK" } };
    const ihre = { rpc: { a: "A", speaker_y: "S" }, common: { ok: "OK", neu: "N" } };
    const { wert, konflikte } = zusammenfuehren(basis, unsere, ihre);
    assert.deepEqual(konflikte, []);
    assert.deepEqual(wert, { common: { neu: "N", ok: "OK" }, rpc: { a: "A", partner_x: "P", speaker_y: "S" } });
  });

  it("übernimmt Änderung und Löschung nur einer Seite", () => {
    const basis = { t: { alt: "Alt", weg: "Weg", bleibt: "B" } };
    const unsere = { t: { alt: "Neu", weg: "Weg", bleibt: "B" } };
    const ihre = { t: { alt: "Alt", bleibt: "B" } };
    const { wert, konflikte } = zusammenfuehren(basis, unsere, ihre);
    assert.deepEqual(konflikte, []);
    assert.deepEqual(wert, { t: { alt: "Neu", bleibt: "B" } });
  });

  it("meldet echte Konflikte mit Pfad und behält vorläufig die erste Fassung", () => {
    const { wert, konflikte } = zusammenfuehren({ t: { x: "0" } }, { t: { x: "1" } }, { t: { x: "2" } });
    assert.deepEqual(konflikte, ["t.x"]);
    assert.deepEqual(wert, { t: { x: "1" } });
  });

  it("kommt ohne Basis aus (Datei auf beiden Seiten neu)", () => {
    const { wert, konflikte } = zusammenfuehren(undefined, { a: "1" }, { b: "2" });
    assert.deepEqual(konflikte, []);
    assert.deepEqual(wert, { a: "1", b: "2" });
  });
});

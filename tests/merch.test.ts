import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  checkMerchValues,
  describeMerch,
  merchPayload,
  parseMerchSchema,
  sizesTotal,
  type MerchField,
} from "@/lib/partner/merch";

/** Ein Shirt, wie ein Merch-Artikel 2027 aussehen könnte (Entscheidung 14). */
const SHIRT: MerchField[] = [
  { key: "logo", label_de: "Logo", label_en: "Logo", type: "logo", required: true },
  {
    key: "sizes",
    label_de: "Größen",
    label_en: "Sizes",
    type: "sizes",
    required: true,
    options: ["S", "M", "L", "XL"],
  },
  {
    key: "print",
    label_de: "Aufdruck",
    label_en: "Print",
    type: "text",
    required: false,
    max_length: 20,
  },
];

describe("Merch-Schema lesen", () => {
  it("nimmt die Liste direkt", () => {
    const fields = parseMerchSchema([{ key: "text", type: "text" }]);
    assert.equal(fields?.length, 1);
    assert.equal(fields?.[0].key, "text");
    // Ohne Angabe ist ein Feld Pflicht — sonst rutscht eine halbe
    // Konfiguration durch, nur weil jemand `required` vergessen hat.
    assert.equal(fields?.[0].required, true);
  });

  it("nimmt auch die Form mit `fields`", () => {
    const fields = parseMerchSchema({ fields: [{ key: "a", type: "sizes", required: false }] });
    assert.equal(fields?.[0].type, "sizes");
    assert.equal(fields?.[0].required, false);
  });

  it("meldet `null`, wo kein Merch-Artikel ist", () => {
    for (const value of [null, undefined, {}, [], "nein", 7, { fields: [] }, [{ type: "text" }]]) {
      assert.equal(parseMerchSchema(value), null, JSON.stringify(value));
    }
  });

  it("fällt bei unbekanntem Feldtyp auf Text zurück statt zu verschwinden", () => {
    const fields = parseMerchSchema([{ key: "x", type: "regenbogen" }]);
    assert.equal(fields?.[0].type, "text");
  });
});

describe("Merch-Konfiguration prüfen", () => {
  it("nimmt eine vollständige Konfiguration", () => {
    const values = { logo: "asset-1", sizes: { S: 2, M: 3 }, print: "ChefTreff" };
    assert.deepEqual(checkMerchValues(SHIRT, values, 5), []);
  });

  it("verlangt Pflichtfelder", () => {
    const problems = checkMerchValues(SHIRT, { sizes: { S: 1 } }, 1);
    assert.deepEqual(problems, [{ key: "logo", reason: "required" }]);
  });

  it("besteht darauf, dass die Größen die Bestellmenge treffen", () => {
    const problems = checkMerchValues(SHIRT, { logo: "a", sizes: { S: 2, M: 2 } }, 5);
    assert.deepEqual(problems, [{ key: "sizes", reason: "sizes_sum", detail: "4/5" }]);
    assert.deepEqual(checkMerchValues(SHIRT, { logo: "a", sizes: { S: 2, M: 3 } }, 5), []);
  });

  it("achtet auf die Zeichengrenze des Aufdrucks", () => {
    const problems = checkMerchValues(
      SHIRT,
      { logo: "a", sizes: { S: 1 }, print: "x".repeat(21) },
      1,
    );
    assert.deepEqual(problems, [{ key: "print", reason: "too_long", detail: "21/20" }]);
  });

  it("weist einen Wert ab, der nicht in der Auswahl steht", () => {
    const fields: MerchField[] = [
      { key: "farbe", label_de: null, label_en: null, type: "select", required: true, options: ["schwarz", "weiß"] },
    ];
    assert.deepEqual(checkMerchValues(fields, { farbe: "pink" }, 1), [
      { key: "farbe", reason: "not_an_option", detail: "pink" },
    ]);
  });

  it("zählt einen ungesetzten Pflicht-Haken als fehlend", () => {
    const fields: MerchField[] = [
      { key: "ok", label_de: null, label_en: null, type: "boolean", required: true },
    ];
    assert.deepEqual(checkMerchValues(fields, { ok: false }, 1), [
      { key: "ok", reason: "required" },
    ]);
    assert.deepEqual(checkMerchValues(fields, { ok: true }, 1), []);
  });

  it("lässt ein leeres freiwilliges Feld in Ruhe", () => {
    assert.deepEqual(checkMerchValues(SHIRT, { logo: "a", sizes: { S: 1 }, print: "  " }, 1), []);
  });

  it("ignoriert Größen ohne Anzahl", () => {
    assert.equal(sizesTotal({ sizes: { S: 0, M: 2, L: -1 } }, "sizes"), 2);
  });
});

describe("Merch-Konfiguration formen", () => {
  it("schickt Zahlen als Zahl und lässt Leeres weg", () => {
    const fields: MerchField[] = [
      { key: "menge", label_de: null, label_en: null, type: "number", required: false },
      { key: "text", label_de: null, label_en: null, type: "text", required: false },
    ];
    assert.deepEqual(merchPayload(fields, { menge: "12", text: "   " }), { menge: 12 });
  });

  it("räumt Nullzeilen aus der Größenverteilung", () => {
    assert.deepEqual(
      merchPayload(SHIRT, { logo: "asset-1", sizes: { S: 0, M: 3 }, print: "Hallo" }),
      { logo: "asset-1", sizes: { M: 3 }, print: "Hallo" },
    );
  });

  it("schreibt einen Haken immer, auch wenn er aus ist", () => {
    const fields: MerchField[] = [
      { key: "ok", label_de: null, label_en: null, type: "boolean", required: false },
    ];
    assert.deepEqual(merchPayload(fields, {}), { ok: false });
  });
});

describe("Merch-Konfiguration anzeigen", () => {
  it("fasst die Größen in der Reihenfolge des Schemas zusammen", () => {
    const rows = describeMerch(SHIRT, { logo: "a", sizes: { M: 3, S: 2 }, print: "Hi" }, "de");
    assert.deepEqual(rows, [
      { label: "Logo", value: "a" },
      { label: "Größen", value: "S 2 · M 3" },
      { label: "Aufdruck", value: "Hi" },
    ]);
  });

  it("nimmt die englische Beschriftung, wenn es sie gibt", () => {
    const rows = describeMerch(SHIRT, { sizes: { S: 1 } }, "en");
    assert.deepEqual(rows, [{ label: "Sizes", value: "S 1" }]);
  });

  it("zeigt nichts an, wo nichts konfiguriert ist", () => {
    assert.deepEqual(describeMerch(SHIRT, null, "de"), []);
    assert.deepEqual(describeMerch(SHIRT, {}, "de"), []);
  });
});

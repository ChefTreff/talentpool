import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { parseMarkdown, parseInline } from "@/components/wiki/markdown-parse";

/**
 * Der Parser gibt Objekte zurück, nie Markup. Diese Tests prüfen zwei Dinge:
 * dass die neuen Blöcke ankommen (F9.6 brauchte Tabellen) und dass nichts
 * einen Weg von Text zu HTML öffnet — rohe Tags bleiben Text, und ein Link
 * entsteht nur für `http(s)`.
 */
describe("Wiki-Markdown: Blöcke", () => {
  it("liest eine Tabelle mit Kopf und Rumpf", () => {
    const [b] = parseMarkdown("| A | B |\n| --- | --- |\n| 1 | 2 |");
    assert.equal(b.kind, "table");
    if (b.kind !== "table") return;
    assert.equal(b.head.length, 2);
    assert.equal(b.rows.length, 1);
    assert.deepEqual(b.rows[0][1], [{ kind: "text", text: "2" }]);
  });

  it("lässt eine einzelne Pipe-Zeile Text bleiben", () => {
    const [b] = parseMarkdown("a | b");
    assert.equal(b.kind, "paragraph");
  });

  it("unterscheidet nummerierte und Aufzählungslisten", () => {
    const [ol] = parseMarkdown("1. eins\n2. zwei");
    const [ul] = parseMarkdown("- eins\n- zwei");
    assert.equal(ol.kind === "list" && ol.ordered, true);
    assert.equal(ul.kind === "list" && ul.ordered, false);
  });

  it("beginnt bei einem Wechsel der Listenart eine neue Liste", () => {
    const blocks = parseMarkdown("- eins\n1. zwei");
    assert.equal(blocks.length, 2);
    assert.equal(blocks[0].kind, "list");
    assert.equal(blocks[1].kind, "list");
  });

  it("fasst aufeinanderfolgende Zitatzeilen zu einem Kasten zusammen", () => {
    const blocks = parseMarkdown("> eins\n> zwei");
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].kind === "quote" && blocks[0].rows.length, 2);
  });

  it("erkennt die Trennlinie", () => {
    assert.equal(parseMarkdown("---")[0].kind, "rule");
  });

  it("nimmt Überschriften bis vier Ebenen", () => {
    const h = parseMarkdown("#### tief")[0];
    assert.equal(h.kind === "heading" && h.level, 4);
  });
});

describe("Wiki-Markdown: Inline", () => {
  it("macht aus HTML im Text kein Markup", () => {
    const parts = parseInline('<img src=x onerror="alert(1)">');
    assert.deepEqual(parts, [{ kind: "text", text: '<img src=x onerror="alert(1)">' }]);
  });

  it("nimmt nur http(s) als Link", () => {
    const parts = parseInline("[klick](javascript:alert(1))");
    assert.ok(parts.every((p) => p.kind !== "link"));
  });

  it("liest Link, fett, kursiv und Code", () => {
    const parts = parseInline("[a](https://x.de) **b** *c* `d`");
    assert.deepEqual(
      parts.filter((p) => p.kind !== "text").map((p) => p.kind),
      ["link", "bold", "italic", "code"],
    );
  });
});

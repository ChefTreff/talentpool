import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("Lieferantenliste: CSV als echter Download (PROD-004)", () => {
  it("lädt über ButtonDownload von der Admin-Adresse, nicht über einen vorladenden Link auf /produktion", () => {
    const seite = src("app/(admin)/admin/produktion/bestellungen/page.tsx");
    assert.match(seite, /<ButtonDownload[\s\S]*href=\{`\/admin\/produktion\/bestellungen\/csv/);
    assert.doesNotMatch(seite, /ButtonLink/);
    assert.doesNotMatch(seite, /["`]\/produktion\//);
  });
});

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const lies = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("Wiki: archivierter Artikel wieder veröffentlichen (ADM-104)", () => {
  const admin = lies("app/(admin)/admin/wiki/WikiAdmin.tsx");

  it("für einen archivierten Artikel steht ein Knopf „Wieder veröffentlichen“ in der Zeile", () => {
    assert.match(admin, /a\.status === "archived" && \(\s*<Button[^>]*onClick=\{\(\) => run\(publishArticle\(a\.id, true\), t\.republished\)\}/);
  });

  it("der bisherige Knopf Veröffentlichen/Zurückziehen bleibt auf nicht archivierte Artikel beschränkt", () => {
    assert.match(admin, /a\.status !== "archived" && \(\s*<Button/);
  });

  it("der Status steht weiter als Marke in der Übersicht", () => {
    assert.match(admin, /<Badge tone=\{STATUS_TONE\[a\.status\] \?\? "neutral"\}>/);
  });

  it("die Beschriftungen stehen in DE und EN", () => {
    for (const l of ["de", "en"]) {
      const d = JSON.parse(lies(`lib/i18n/${l}.json`)) as { wiki: Record<string, string> };
      assert.ok(d.wiki.republish, `${l}.wiki.republish`);
      assert.ok(d.wiki.republished, `${l}.wiki.republished`);
    }
  });

  it("die Datenbank verweigert das Wiederveröffentlichen nicht (Live-Fassung, kein Statusfilter)", () => {
    const fn = lies("supabase/snapshot/functions/publish_kb_article.sql");
    assert.match(fn, /can_edit_kb_all\(v_audience\)/);
    assert.doesNotMatch(fn, /status\s*(=|<>|!=)\s*'archived'/);
  });
});

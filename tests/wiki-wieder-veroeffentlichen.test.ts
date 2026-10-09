import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const lies = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("Wiki: archivierter Artikel wieder veröffentlichen (ADM-104, seit ADM-103 je Sprachfassung im Artikel)", () => {
  const form = lies("app/(admin)/admin/wiki/ArtikelFormular.tsx");
  const admin = lies("app/(admin)/admin/wiki/WikiAdmin.tsx");

  it("für eine archivierte Fassung steht ein Knopf „Wieder veröffentlichen“ im Artikel", () => {
    assert.match(form, /fassung\.status === "archived" && \(\s*<Button[^>]*onClick=\{\(\) => onPublish\(fassung\.id, true, t\.republished\)\}/);
  });

  it("Veröffentlichen/Zurückziehen und Archivieren bleiben auf nicht archivierte Fassungen beschränkt", () => {
    assert.match(form, /fassung\.status !== "archived" && \(\s*<Button/);
  });

  it("der Status steht je Sprache als Marke in der Übersicht, und das Veröffentlichen läuft über publish_kb_article je Zeile", () => {
    assert.match(admin, /<Badge\s+tone=\{STATUS_TONE\[z\.status\] \?\? "neutral"\}>/);
    assert.match(admin, /publishArticle\(id, published\)/);
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

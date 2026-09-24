import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";

describe("Folien nach dem Summit (TAL-001)", () => {
  const sql = migrationText("v6_folien_teilnehmende");
  const fn = sql.slice(sql.indexOf("create or replace function my_session_slides"));

  it("prüft alle Bedingungen aus dem Kontrakt der Speaker-Domäne", () => {
    for (const bedingung of [
      "sa.kind = 'presentation'",
      "sa.is_current",
      "sa.slides_release",
      "s.publish_status = 'published'",
      "now() > sl.end_at",
      "t.person_id = v_me",
    ]) {
      assert.ok(fn.includes(bedingung), bedingung);
    }
  });

  it("signiert nur serverseitig und lädt herunter statt ein Fenster zu öffnen", () => {
    const page = readFileSync(new URL("../app/(talent)/folien/page.tsx", import.meta.url), "utf8");
    assert.match(page, /rpc\("my_session_slides"\)/);
    assert.match(page, /createSignedUrls\([\s\S]*\{ download: true \}\)/);
    // Der Speicherpfad geht nicht in eine Client-Komponente.
    assert.doesNotMatch(page, /"use client"/);
  });

  it("steht in der Seitengruppe Summit", () => {
    const layout = readFileSync(new URL("../app/(talent)/layout.tsx", import.meta.url), "utf8");
    assert.match(layout, /href: "\/folien"/);
  });
});

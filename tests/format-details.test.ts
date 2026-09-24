import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { targetProfileLabels } from "@/app/(talent)/programm/types";
import { migrationText } from "@/tests/migration-datei";

describe("Format-Details für Teilnehmende (TAL-002/003)", () => {
  it("übersetzt gesuchte Profile in fester Reihenfolge und ignoriert Fremdes", () => {
    const label = (v: string, k: string) => `${v}:${k}`;
    assert.deepEqual(
      targetProfileLabels(
        { study_field: ["wiwi"], occupation_status: ["master", "bachelor"], fremd: ["x"] } as Record<string, string[]>,
        label,
      ),
      ["occupation_status:master", "occupation_status:bachelor", "study_field:wiwi"],
    );
    assert.deepEqual(targetProfileLabels(null, label), []);
  });

  it("gibt keine Kontaktdaten der Tour-Stopps heraus", () => {
    const sql = migrationText("v6_format_details_public");
    const fn = sql.slice(sql.indexOf("create or replace function programme_format_details"));
    assert.doesNotMatch(fn, /contact_(name|email|phone)/);
    assert.doesNotMatch(fn, /\bnotes\b(?!_public)/);
    assert.match(fn, /s\.publish_status = 'published'/);
  });

  it("signiert Bilder serverseitig und zeigt die Details für alle vier Formate", () => {
    const page = readFileSync(new URL("../app/(talent)/programm/page.tsx", import.meta.url), "utf8");
    assert.match(page, /rpc\("programme_format_details"\)/);
    assert.match(page, /from\("partner-assets"\)[\s\S]*createSignedUrls/);
    const view = readFileSync(new URL("../app/(talent)/programm/ProgrammeView.tsx", import.meta.url), "utf8");
    assert.match(view, /<FormatDetailsBlock/);
    assert.doesNotMatch(view, /format === "(masterclass|company_tour|side_event|interview_table)"/);
  });
});

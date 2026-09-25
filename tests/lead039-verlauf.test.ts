import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { toRpcFailure } from "@/lib/rpc-error";
import { MAX_EINTRAG, VERLAUF_ARTEN, fristStand, heute } from "@/lib/speaker/verlauf";
import { migrationText } from "@/tests/migration-datei";

/**
 * Verlauf der Speaker-Pipeline (LEAD-039 Schnitt 2). Die Oberfläche bietet Arten
 * an, prüft Längen und ruft die RPCs mit Parameternamen auf — alles steht auch
 * in der Migration und darf nicht auseinanderlaufen.
 */
const sql = () => migrationText("v6_lead039_verlauf");
const woerterbuch = (sprache: "de" | "en") =>
  JSON.parse(readFileSync(new URL(`../lib/i18n/${sprache}.json`, import.meta.url), "utf8"));
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("Verlauf: Oberfläche und Datenbank sprechen dieselbe Sprache", () => {
  it("die Arten der Oberfläche sind genau die des Vokabulars", () => {
    // Nur die Zeilen von `vocab_term` (mit Bezeichnungen und Sortierzahl), nicht `vocab_binding`.
    const imVokabular = [
      ...sql().matchAll(/\('speaker_activity_kind', '([a-z_]+)',\s*'[^']*',\s*'[^']*',\s*\d+\)/g),
    ].map((m) => m[1]);
    assert.deepEqual(imVokabular, [...VERLAUF_ARTEN]);
  });

  it("die Höchstlänge ist die der CHECK-Regel", () => {
    assert.match(sql(), new RegExp(`length\\(btrim\\(body\\)\\) between 1 and ${MAX_EINTRAG}`));
    assert.match(sql(), new RegExp(`length\\(v_body\\) > ${MAX_EINTRAG}`));
  });

  it("die Server-Aktionen rufen die RPCs mit deren Parameternamen", () => {
    const s = sql();
    const a = quelle("components/speaker/verlauf-actions.ts");
    const faelle: [string, string, string[]][] = [
      ["add_speaker_activity", "add_speaker_activity(p_profile_id uuid, p_data jsonb)", ["p_profile_id", "p_data"]],
      ["update_speaker_activity", "update_speaker_activity(p_id uuid, p_data jsonb)", ["p_id", "p_data"]],
      ["set_speaker_activity_done", "set_speaker_activity_done(p_id uuid, p_done boolean)", ["p_id", "p_done"]],
      ["delete_speaker_activity", "delete_speaker_activity(p_id uuid)", ["p_id"]],
      ["speaker_activities", "speaker_activities(p_profile_id uuid)", ["p_profile_id"]],
    ];
    for (const [name, signatur, parameter] of faelle) {
      assert.ok(s.includes(`function ${signatur}`), `${signatur} fehlt in der Migration`);
      const aufruf = a.slice(a.indexOf(`rpc("${name}"`), a.indexOf(`rpc("${name}"`) + 400);
      assert.ok(aufruf.length > 0 && a.includes(`rpc("${name}"`), `${name} wird nicht aufgerufen`);
      for (const p of parameter) assert.ok(aufruf.includes(`${p}:`), `${name} ohne ${p}`);
    }
  });

  it("manager_speakers liefert den Stand des Verlaufs und behält die alten Spalten", () => {
    const s = sql();
    assert.match(s, /open_tasks integer, next_task jsonb, last_activity_at timestamp with time zone\)/);
    assert.match(s, /internal_notes text/);
    assert.match(s, /stage_candidates jsonb/);
  });
});

describe("Verlauf: Fehlerschlüssel kommen als eigene Meldung an", () => {
  const FAELLE = [
    { code: "22023", message: "invalid_activity_kind" },
    { code: "22023", message: "body_required" },
    { code: "22023", message: "due_required" },
    { code: "22023", message: "invalid_assignee" },
    { code: "22023", message: "not_a_task" },
    { code: "P0002", message: "activity_not_found" },
  ];
  for (const f of FAELLE) {
    it(`${f.message} → eigener Schlüssel, Text in DE und EN`, () => {
      const res = toRpcFailure({ code: f.code, message: f.message, details: "", hint: "", name: "PostgrestError" } as Parameters<
        typeof toRpcFailure
      >[0]);
      assert.equal(res.key, f.message);
      assert.ok(woerterbuch("de").rpc[f.message], `de.rpc.${f.message} fehlt`);
      assert.ok(woerterbuch("en").rpc[f.message], `en.rpc.${f.message} fehlt`);
      assert.match(sql(), new RegExp(`'${f.message}'`), `${f.message} kommt in der Migration nicht vor`);
    });
  }
});

describe("Verlauf: Fristen", () => {
  it("unterscheidet überfällig, heute und später", () => {
    assert.equal(fristStand("2027-04-15", "2027-04-16"), "ueberfaellig");
    assert.equal(fristStand("2027-04-16", "2027-04-16"), "heute");
    assert.equal(fristStand("2027-04-17", "2027-04-16"), "spaeter");
  });

  it("heute ist der Kalendertag in Berlin, nicht in UTC", () => {
    // 23:30 UTC am 15.04. ist in Berlin (Sommerzeit) schon der 16.04.
    assert.equal(heute("Europe/Berlin", new Date("2027-04-15T23:30:00Z")), "2027-04-16");
    assert.equal(heute("UTC", new Date("2027-04-15T23:30:00Z")), "2027-04-15");
  });
});

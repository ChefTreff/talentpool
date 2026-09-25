import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { uebersicht } from "@/app/(speaker-leads)/speaker-leads/uebersicht";
import type { ManagedSpeaker } from "@/app/(speaker-leads)/speaker-leads/types";

/**
 * Übersicht des Stage-Lead-Portals (LEAD-024): die Zahlen kommen aus
 * denselben Zeilen wie Pipeline und Bestätigte — hier steht, wie gezählt wird.
 */

const ICH = "p-ich";

function speaker(id: string, x: Partial<ManagedSpeaker> = {}): ManagedSpeaker {
  return {
    id,
    person_id: `person-${id}`,
    first_name: "TEST",
    last_name: id,
    pipeline_status: "lead",
    stage_guest: false,
    next_open: [],
    open_tasks: 0,
    next_task: null,
    ...x,
  } as ManagedSpeaker;
}

const aufgabe = (due_on: string, assignee_person_id: string | null = ICH) => ({
  id: `t-${due_on}`,
  body: "Nachfassen",
  due_on,
  assignee_person_id,
  assignee_name: null,
});

describe("Stage-Lead-Übersicht (LEAD-024)", () => {
  const speakers = [
    speaker("a", { pipeline_status: "lead", open_tasks: 2, next_task: aufgabe("2026-09-30") }),
    speaker("b", { pipeline_status: "contacted", open_tasks: 1, next_task: aufgabe("2026-09-20") }),
    speaker("c", { pipeline_status: "confirmed", next_open: ["photo", "session"], open_tasks: 1, next_task: aufgabe("2026-09-26") }),
    speaker("d", { pipeline_status: "published", next_open: [] }),
    speaker("e", { pipeline_status: "declined" }),
    // Aufgabe einer anderen Person: zählt bei „offene Aufgaben“, nicht bei „meine“.
    speaker("f", { pipeline_status: "lead", open_tasks: 1, next_task: aufgabe("2026-09-01", "p-andere") }),
    // Gast eines Partners (SPK-070): zählt nirgends.
    speaker("g", { pipeline_status: "confirmed", stage_guest: true, next_open: ["photo"], open_tasks: 3, next_task: aufgabe("2026-09-02") }),
  ];
  const scope = {
    person_id: ICH,
    slots: [
      { id: "s1", stage_id: "st", stage_name: "Main", start_at: "", end_at: "", session_id: "x", edition_id: "e" },
      { id: "s2", stage_id: "st", stage_name: "Main", start_at: "", end_at: "", session_id: null, edition_id: "e" },
      { id: "s3", stage_id: "st", stage_name: "Main", start_at: "", end_at: "", session_id: "y", edition_id: "e" },
    ],
  };
  const u = uebersicht(speakers, scope, "2026-09-26");

  it("zählt Ansprache, Bestätigte und offene Aufgaben ohne Gäste", () => {
    assert.equal(u.ansprache, 3, "lead, contacted, lead");
    assert.equal(u.bestaetigt, 2, "confirmed und published");
    assert.equal(u.offeneAufgaben, 5, "2 + 1 + 1 + 1, ohne die 3 des Gasts");
  });

  it("listet nur meine Aufgaben, früheste zuerst, mit Frist-Stand", () => {
    assert.deepEqual(
      u.meineAufgaben.map((a) => [a.speaker.id, a.stand]),
      [
        ["b", "ueberfaellig"],
        ["c", "heute"],
        ["a", "spaeter"],
      ],
    );
    assert.equal(u.faellig, 2, "überfällig und heute — wie „Fällig“ in der Pipeline");
  });

  it("nennt bestätigte Speaker mit offenen Schritten", () => {
    assert.deepEqual(u.fehltNoch.map((s) => s.id), ["c"]);
  });

  it("zählt die Slots der eigenen Bühnen", () => {
    assert.deepEqual(u.slots, { gesamt: 3, belegt: 2 });
  });

  it("jeder Link der Übersicht zeigt auf eine vorhandene Seite, die Pipeline steht in der Navigation", () => {
    const basis = join("app", "(speaker-leads)");
    const seite = readFileSync(join(basis, "speaker-leads", "UebersichtAnsicht.tsx"), "utf8");
    const ziele = [...new Set([...seite.matchAll(/href="(\/speaker-leads[^"#?]*)"/g)].map((m) => m[1]))];
    assert.ok(ziele.length >= 3, ziele.join(", "));
    for (const ziel of ziele) {
      assert.ok(existsSync(join(basis, ...ziel.split("/").filter(Boolean), "page.tsx")), `keine Seite für ${ziel}`);
    }
    const layout = readFileSync(join(basis, "layout.tsx"), "utf8");
    const uebersichtEintrag = layout.indexOf('href: "/speaker-leads",');
    const pipelineEintrag = layout.indexOf('href: "/speaker-leads/pipeline"');
    // Beide müssen da sein — sonst wäre „-1 < n“ ein grüner Test, der nichts belegt.
    assert.ok(uebersichtEintrag >= 0 && pipelineEintrag >= 0, "Übersicht und Pipeline in der Navigation");
    assert.ok(uebersichtEintrag < pipelineEintrag, "Übersicht vor Pipeline");
  });
});

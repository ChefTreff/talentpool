import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { AREAS, canEnterArea } from "@/lib/areas";
import { EXTERNAL_ROLES, TEAM_ROLES } from "@/lib/admin-sections";
import { toRpcFailure } from "@/lib/rpc-error";
import { migrationText } from "@/tests/migration-datei";

/**
 * PORT3, Variante A (Entscheidungslog 25.09.): `speaker_manager` ist die Rolle
 * der externen Stage Leads — nur `/speaker-leads/*`, kein Admin, nur die eigenen
 * Bühnen. Die Datenbank-Seite belegt `supabase/tests/v6_port3_stage_leads.sql`
 * mit echtem Rollenwechsel; hier stehen das Tor der App und die Verträge.
 */
const sql = () => migrationText("v6_port3_stage_leads");
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const woerterbuch = (sprache: "de" | "en") =>
  JSON.parse(readFileSync(new URL(`../lib/i18n/${sprache}.json`, import.meta.url), "utf8"));
const bereich = (key: string) => {
  const a = AREAS.find((x) => x.key === key);
  assert.ok(a, `Bereich ${key} fehlt`);
  return a;
};

function funktion(name: string): string {
  const s = sql();
  const start = s.search(new RegExp(`create (or replace )?function ${name}\\(`));
  assert.ok(start >= 0, `${name} fehlt in der Migration`);
  return s.slice(start, s.indexOf("$$;", s.indexOf("AS $$", start) + 5));
}

describe("PORT3: das Tor der App", () => {
  it("ein reiner Stage Lead kommt in /speaker-leads, nicht in den Admin", () => {
    assert.equal(canEnterArea(bereich("speaker-leads"), ["speaker_manager"]), true);
    assert.equal(canEnterArea(bereich("admin"), ["speaker_manager"]), false);
    // Auch zusammen mit Rollen externer Portale nicht.
    assert.equal(canEnterArea(bereich("admin"), ["speaker_manager", "speaker", "partner_contact"]), false);
  });

  it("speaker_manager steht bei den externen Rollen, nie im Team", () => {
    assert.ok((EXTERNAL_ROLES as readonly string[]).includes("speaker_manager"));
    assert.ok(!(TEAM_ROLES as readonly string[]).includes("speaker_manager"));
  });
});

describe("PORT3: Datenbank-Verträge", () => {
  it("L5: Anlegen überschreibt keine fremden Profile und nimmt von Nicht-Team keine person_id", () => {
    const f = funktion("upsert_speaker");
    assert.match(f, /if not v_team and v_pid is not null then\s+raise exception 'not allowed' using errcode = '42501'/);
    assert.match(f, /if v_existing is not null and not v_team and not can_manage_speaker\(v_existing\) then\s+raise exception 'not allowed' using errcode = '42501'/);
    // Die Prüfung steht vor dem Schreiben.
    assert.ok(f.indexOf("can_manage_speaker(v_existing)") < f.indexOf("insert into speaker_profile"));
  });

  it("L1: can_manage_speaker kennt keinen Edition-Zweig mehr, die Bühne über is_stage_lead_of", () => {
    const f = funktion("can_manage_speaker");
    assert.doesNotMatch(f, /has_role\('speaker_manager', 'edition'/);
    assert.match(f, /is_stage_lead_of\(sl\.stage_id\)/);
    assert.match(f, /coalesce\(ev\.edition_id, ev\.id\) = sp\.edition_id/);
  });

  it("L2/L6: weder Suche noch Scope kennen global oder Edition für speaker_manager", () => {
    assert.doesNotMatch(funktion("can_search_board"), /scope_type = 'global'|scope_type = 'edition'/);
    const scope = funktion("my_manager_scope");
    assert.doesNotMatch(scope, /v_global/);
    assert.match(scope, /'all', v_team,/);
    assert.match(scope, /scope_stage_id\(ra\.scope_type, ra\.scope_id\)/);
  });

  it("L3/L4: Suche nur verwaltete Speaker, Adressen nur fürs Team", () => {
    assert.match(funktion("board_search_people"), /and \(v_editor or can_manage_speaker\(sp\.id\)\)/);
    assert.match(funktion("speaker_managers"), /case when has_role\('admin'\) or has_role\('area_lead_speaker'\) or has_role\('programme_team'\)/);
  });

  it("L7: Vergabe nur je Bühne, Tag oder Slot — dazu die CHECK-Regel als not valid", () => {
    assert.match(funktion("assign_role"), /raise exception 'stage_scope_required' using errcode = '22023'/);
    assert.match(sql(), /add constraint role_assignment_stage_lead_scope_chk\s+check \(role <> 'speaker_manager' or scope_type in \('stage', 'stage_day', 'slot'\)\) not valid;/);
    assert.match(sql().trimEnd(), /select harden_definer_functions\(\);$/);
  });

  it("die internen Helfer sind gesperrt, is_stage_lead_of prüft nur die eigene Rolle", () => {
    assert.ok(sql().includes("revoke execute on function scope_stage_id(text, uuid) from public, anon, authenticated;"));
    assert.match(funktion("is_stage_lead_of"), /from active_roles\(\) ra/);
  });
});

describe("PORT3: Admin-Weg", () => {
  it("Stage Leads werden je Bühne aufgenommen", () => {
    const a = quelle("app/(admin)/admin/speaker-leads/actions.ts");
    assert.match(a, /export async function makeLead\(personId: string, stageId: string\)/);
    assert.match(a, /p_scope_type: "stage",\s+p_scope_id: stageId,/);
    assert.doesNotMatch(a, /p_scope_type: "edition"/);
    assert.match(quelle("app/(admin)/admin/speaker-leads/LeadsView.tsx"), /makeLead\(p\.id, buehne\)/);
  });

  it("stage_scope_required kommt als eigene Meldung an", () => {
    const res = toRpcFailure({ code: "22023", message: "stage_scope_required", details: "edition", hint: "", name: "PostgrestError" } as Parameters<
      typeof toRpcFailure
    >[0]);
    assert.equal(res.key, "stage_scope_required");
    for (const sprache of ["de", "en"] as const) {
      assert.ok(woerterbuch(sprache).rpc.stage_scope_required, `${sprache}.rpc fehlt`);
      assert.ok(woerterbuch(sprache).adminSpeakerLeads.stageLabel, `${sprache}.adminSpeakerLeads.stageLabel fehlt`);
    }
  });
});

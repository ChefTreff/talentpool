import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";
import { baueZeilen, fehlende, type AssetZeile, type BoardZeile } from "@/components/speaker/praesentationen";

/**
 * LEAD-023: Präsentationen je Slot für Stage Leads (und im Admin), mit Upload
 * für Dateien per Mail. LEAD-038: Rückgabegrund im Board-Drawer für die
 * Programmleitung.
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const slot = (z: Partial<BoardZeile>): BoardZeile => ({
  slot_id: "sl", session_id: "se", stage_id: "st", stage_name: "Bühne", start_at: "2027-04-16T13:00:00Z",
  end_at: "2027-04-16T13:30:00Z", title_de: "Talk", title_en: "Talk EN", can_edit: true, speakers: [], ...z,
});
const asset = (z: Partial<AssetZeile>): AssetZeile => ({
  id: "a", profile_id: "pr1", session_id: "se", kind: "presentation", filename: "folien.pdf", version: 1,
  is_current: true, late: false, tech_check_status: "pending", created_at: "2027-04-01T10:00:00Z", ...z,
});

describe("LEAD-023: Zusammensetzung", () => {
  it("nur bearbeitbare Slots mit Session, ohne Moderation, je Speaker die aktuelle Datei dieser Session", () => {
    const zeilen = baueZeilen(
      [
        slot({ speakers: [
          { person_id: "p1", role: "speaker", first_name: "Anna", last_name: "ZZ" },
          { person_id: "p2", role: "moderator", first_name: "Mo", last_name: "ZZ" },
          { person_id: "p3", role: "speaker", first_name: "Ben", last_name: "ZZ" },
        ] }),
        slot({ slot_id: "sl2", session_id: "se2", can_edit: false }),
        slot({ slot_id: "sl3", session_id: null }),
      ],
      [{ id: "pr1", person_id: "p1" }],
      [
        asset({ version: 1, is_current: false }),
        asset({ id: "b", version: 2 }),
        asset({ id: "c", session_id: "andere", version: 9 }),
        asset({ id: "d", kind: "photo", version: 5 }),
      ],
      "de",
    );
    assert.equal(zeilen.length, 1);
    assert.equal(zeilen[0].titel, "Talk");
    assert.deepEqual(zeilen[0].speakers.map((s) => s.name), ["Anna ZZ", "Ben ZZ"]);
    assert.equal(zeilen[0].speakers[0].datei?.version, 2);
    assert.equal(zeilen[0].speakers[1].profile_id, null);
    assert.equal(zeilen[0].speakers[1].datei, null);
    // Ben hat kein betreutes Profil: zählt nicht als „fehlt“, weil niemand hochladen kann.
    assert.equal(fehlende(zeilen), 0);
    assert.equal(baueZeilen([slot({})], [], [], "en")[0].titel, "Talk EN");
  });
});

describe("LEAD-023: Einbau", () => {
  it("Lead-Portal und Admin mit je eigener Aktion hinter dem eigenen Tor", () => {
    const lead = quelle("app/(speaker-leads)/speaker-leads/praesentationen/page.tsx");
    assert.match(lead, /requireArea\("speaker-leads", PATH\)/);
    assert.match(lead, /register=\{registerPresentationAsLead\}/);
    const admin = quelle("app/(admin)/admin/technik/praesentationen/page.tsx");
    assert.match(admin, /requireAdminSection\("tech", PATH\)/);
    assert.match(admin, /register=\{registerPresentationAsAdmin\}/);
    assert.match(quelle("app/(speaker-leads)/layout.tsx"), /href: "\/speaker-leads\/praesentationen"/);
    assert.match(quelle("app/(admin)/admin/technik/page.tsx"), /href="\/admin\/technik\/praesentationen"/);
  });

  it("gelesen wird mit der Sitzung aus programme_board, eingetragen über register_speaker_asset", () => {
    const l = quelle("lib/speaker/praesentationen.ts");
    assert.doesNotMatch(l, /createSupabaseAdminClient/);
    assert.match(l, /from\("programme_board"\)/);
    assert.match(l, /p_kind: "presentation"/);
  });

  it("Fehler stehen an der Zeile, nicht als Toast", () => {
    const k = quelle("components/speaker/PraesentationenListe.tsx");
    assert.doesNotMatch(k, /toast\("error"/);
    assert.match(k, /role="alert"/);
  });
});

describe("LEAD-038: Rückgabegrund im Drawer", () => {
  it("nur die Programmleitung liest den Grund, die Tabelle bleibt zu", () => {
    const s = migrationText("v6_board_rueckgabe_team");
    assert.match(s, /is_programme_editor\(v_event\)/);
    assert.match(s, /from partner_session_return r/);
    assert.doesNotMatch(s, /grant [a-z, ]+ on partner_session_return/);
    assert.match(s.trimEnd(), /select harden_definer_functions\(\);$/);
  });

  it("loadSession holt ihn, der Drawer zeigt ihn bis zur Veröffentlichung", () => {
    assert.match(quelle("components/programme/actions.ts"), /rpc\("board_session_return", \{ p_session_id: sessionId \}\)/);
    assert.match(quelle("components/programme/SessionDrawer.tsx"), /detail\.rueckgabe && !isPublished/);
  });

  it("die Texte stehen in DE und EN", () => {
    for (const sprache of ["de", "en"] as const) {
      const w = JSON.parse(readFileSync(new URL(`../lib/i18n/${sprache}.json`, import.meta.url), "utf8"));
      assert.ok(w.admin.programme.returnedBy?.includes("{name}"), `${sprache}.admin.programme.returnedBy fehlt`);
      assert.ok(w.leads.navPresentations, `${sprache}.leads.navPresentations fehlt`);
      for (const k of ["title", "leadLeads", "leadAdmin", "missing", "upload", "replace", "shown", "rules"]) {
        assert.ok(w.presentationsList[k], `${sprache}.presentationsList.${k} fehlt`);
      }
    }
  });
});

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";
import { abgeleiteteNamen, ownerOptionen, verantwortlich, type SessionVerantwortung } from "@/components/programme/verantwortung";

/**
 * ADM-018: Verantwortliche je Session — aus den Stage Leads abgeleitet (engste
 * Stufe gewinnt), je Session übersteuerbar. ADM-062: Fehler in den
 * Speaker-Lead-Fenstern stehen am Formular, nicht als Toast.
 */
const sql = () => migrationText("v6_session_verantwortliche");
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const zeile = (z: Partial<SessionVerantwortung>): SessionVerantwortung => ({
  session_id: "s1", owner_person_id: null, owner_name: null, derived_person_ids: [], derived_names: [], ...z,
});

describe("ADM-018: Anzeige", () => {
  it("die Übersteuerung geht vor, sonst die Ableitung, sonst niemand", () => {
    assert.deepEqual(
      verantwortlich(zeile({ owner_person_id: "p2", owner_name: "Lou", derived_person_ids: ["p1"], derived_names: ["Lea"] })),
      { namen: "Lou", uebersteuert: true },
    );
    assert.deepEqual(verantwortlich(zeile({ derived_person_ids: ["p1", "p3"], derived_names: ["Lea", null, "Lia"] })), {
      namen: "Lea, Lia",
      uebersteuert: false,
    });
    assert.equal(verantwortlich(zeile({})), null);
    assert.equal(verantwortlich(undefined), null);
    assert.equal(abgeleiteteNamen(undefined), "");
  });

  it("die gesetzte Person bleibt wählbar, auch wenn ihre Rolle abgelaufen ist", () => {
    const kandidaten = [{ person_id: "p1", name: "Lea" }];
    assert.deepEqual(ownerOptionen(zeile({ owner_person_id: "p1", owner_name: "Lea" }), kandidaten), [{ value: "p1", label: "Lea" }]);
    assert.deepEqual(ownerOptionen(zeile({ owner_person_id: "p9", owner_name: "Alt" }), kandidaten), [
      { value: "p1", label: "Lea" },
      { value: "p9", label: "Alt" },
    ]);
  });
});

describe("ADM-018: Datenbank", () => {
  it("die engste Stufe gewinnt: Slot, dann Bühnentag, dann Bühne", () => {
    const s = sql();
    const slot = s.indexOf("l.scope_type = 'slot'");
    const tag = s.indexOf("l.scope_type = 'stage_day'");
    const buehne = s.indexOf("l.scope_type = 'stage' and");
    assert.ok(slot > 0 && slot < tag && tag < buehne, "Reihenfolge der Stufen stimmt nicht");
    assert.match(s, /ra\.valid_from <= now\(\) and \(ra\.valid_to is null or ra\.valid_to > now\(\)\)/);
    assert.match(s, /p\.access_blocked_at is null/);
  });

  it("setzen nur die Programmleitung, nur auf Stage Leads der Veranstaltung, mit Audit", () => {
    const s = sql();
    const setzen = s.slice(s.indexOf("create or replace function set_session_owner("));
    assert.match(setzen, /is_programme_editor\(v_se\.event_id\)/);
    assert.match(setzen, /raise exception 'owner_not_lead' using errcode = '22023'/);
    assert.match(setzen, /perform log_audit\('session\.owner', 'session'/);
    assert.match(s, /revoke execute on function event_stage_leads\(uuid\) from public, anon, authenticated;/);
    assert.match(s, /revoke execute on function slot_stage_leads\(uuid\) from public, anon, authenticated;/);
    assert.match(s.trimEnd(), /select harden_definer_functions\(\);$/);
  });

  it("Stage Leads lesen nur Sessions, deren Slot sie bearbeiten dürfen", () => {
    assert.match(sql(), /and \(v_editor or can_edit_slot\(sl\.id\)\)/);
  });
});

describe("ADM-018: Tabelle", () => {
  it("Admin und Stage Leads laden die Spalte, die Partner-Sicht nicht", () => {
    assert.match(quelle("app/(admin)/admin/programm/tabelle/page.tsx"), /mitVerantwortlichen: true/);
    assert.match(quelle("app/(speaker-leads)/speaker-leads/board/tabelle/page.tsx"), /mitVerantwortlichen: true/);
    assert.doesNotMatch(quelle("app/(partner)/partner/buehne/tabelle/page.tsx"), /mitVerantwortlichen/);
    const tabelle = quelle("components/programme/ProgrammeTable.tsx");
    assert.match(tabelle, /\{verantwortliche && <Th>\{t\.colOwner\}<\/Th>\}/);
    assert.match(tabelle, /run\(setSessionOwner\(sessionId, e\.target\.value \|\| null\), t\.ownerSaved\)/);
  });

  it("die Texte stehen in DE und EN", () => {
    for (const sprache of ["de", "en"] as const) {
      const w = JSON.parse(readFileSync(new URL(`../lib/i18n/${sprache}.json`, import.meta.url), "utf8"));
      for (const k of ["colOwner", "ownerDerived", "ownerDerivedHelp", "ownerOverridden", "ownerNobody", "ownerSaved"]) {
        assert.ok(w.admin.programmeTable[k], `${sprache}.admin.programmeTable.${k} fehlt`);
      }
      assert.ok(w.rpc.owner_not_lead, `${sprache}.rpc.owner_not_lead fehlt`);
    }
  });
});

describe("ADM-062: Fehler am Formular", () => {
  it("die Speaker-Lead-Fenster melden Fehler im Dialog, nicht als Toast", () => {
    for (const p of ["app/(speaker-leads)/speaker-leads/SpeakerFenster.tsx", "app/(speaker-leads)/speaker-leads/NewSpeakerDrawer.tsx"]) {
      assert.doesNotMatch(quelle(p), /toast\("error"/, `${p} meldet Fehler noch als Toast`);
      assert.match(quelle(p), /error=\{fehler\}/);
    }
  });

  it("Modal kennt eine Fehlermeldung wie Drawer", () => {
    const m = quelle("components/ui/Modal.tsx");
    assert.match(m, /error\?: string \| null;/);
    assert.match(m, /role="alert"/);
  });
});

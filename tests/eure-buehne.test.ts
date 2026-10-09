import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";

/**
 * PART-138 (Konrad & Leopold 05.10., K-84 08.10.), Teil 1 — „Eure Bühne“, Datenbank-Seite. Die Datenbank belegt `supabase/tests/v6_eure_buehne.sql` (echter
 * Rollenwechsel: Partner A mit Bearbeitungsrecht, Leser einer anderen Organisation, Team; 19 Erwartungen mit Auswertung, 18 Mutationsproben). Hier steht, was sich
 * ohne Datenbank festhalten lässt: die Form der Migration (Quelltext-Prüfung — gelesen wird der Text, nichts läuft). Seite und Menü (Teil 2) folgen nach „Migration live“.
 */
const migration = () => migrationText("v6_eure_buehne");
/** Kommentare raus: ein Satz, der etwas erwähnt, ist keine Anweisung. */
const code = (sql: string) => sql.replace(/--[^\n]*/g, "");

function funktion(sql: string, name: string): string {
  const m = new RegExp(`create or replace function ${name}\\(([\\s\\S]*?)(?=\\ncreate or replace function |\\nselect harden_definer_functions|$)`).exec(sql);
  assert.ok(m, `Funktion ${name} nicht gefunden`);
  return m[0];
}

describe("PART-138: Migration v6_eure_buehne (Quelltext-Prüfung)", () => {
  it("ändert genau drei Funktionen, alle SECURITY DEFINER mit gepinntem search_path, und härtet am Ende", () => {
    const sql = code(migration());
    const namen = [...sql.matchAll(/create or replace function (\w+)\(/g)].map((m) => m[1]);
    assert.deepEqual(namen, ["partner_overview", "partner_add_speaker", "partner_speakers"]);
    for (const n of namen) {
      const f = funktion(sql, n);
      assert.match(f, /security definer/i, `${n}: security definer`);
      assert.match(f, /search_path to 'public', 'extensions'/i, `${n}: search_path`);
    }
    assert.ok(sql.trim().endsWith("select harden_definer_functions();"));
    assert.ok(!migration().includes("$$;;"), "kein doppeltes Semikolon hinter einem Funktionsende");
  });

  it("has_stage zählt nur die Standbühne und die gebrandete Bühne, nur aktive", () => {
    const f = funktion(code(migration()), "partner_overview");
    assert.match(f, /'has_stage', exists \(select 1 from stage st join event ev on ev\.id = st\.event_id\s+where st\.partner_org_id = p_org_id and st\.active and st\.kind in \('booth', 'branded'\)/);
  });

  it("partner_add_speaker fällt auf die gebrandete Bühne zurück — nur wenn die Session keine Organisation hat, und prüft das Recht an der gefundenen Organisation", () => {
    const f = funktion(code(migration()), "partner_add_speaker");
    assert.match(f, /v_org := v_se\.partner_org_id;\s+if v_org is null then\s+select st\.partner_org_id into v_org from slot sl join stage st on st\.id = sl\.stage_id\s+where sl\.id = v_se\.slot_id and st\.kind = 'branded';\s+end if;\s+if v_org is null or not partner_can_edit\(v_org\) then\s+raise exception 'not allowed' using errcode = '42501';/);
    // alles Weitere hängt an der gefundenen Organisation, nicht mehr an der der Session
    assert.equal((f.match(/v_se\.partner_org_id/g) ?? []).length, 1, "v_se.partner_org_id steht nur noch in der Zuweisung");
    for (const stelle of [
      /org_edition oe where oe\.org_id = v_org/,
      /sp\.created_by_org_id = v_org/,
      /om\.org_id = v_org and om\.roles @> '\{primary_ops\}'/,
      /v_org, v_neu\)/,
      /jsonb_build_object\('org_id', v_org, 'person_id', v_person,/,
    ]) assert.match(f, stelle, String(stelle));
  });

  it("partner_speakers hängt die Session einer gebrandeten Bühne ohne eigene Organisation an die Organisation der Bühne", () => {
    const f = funktion(code(migration()), "partner_speakers");
    assert.match(
      f,
      /left join session se on se\.id = ss\.session_id\s+and \(se\.partner_org_id = p_org_id\s+or \(se\.partner_org_id is null\s+and exists \(select 1 from slot sl join stage st on st\.id = sl\.stage_id\s+where sl\.id = se\.slot_id and st\.kind = 'branded' and st\.partner_org_id = p_org_id\)\)\)/,
    );
  });

  it("die Gäste-Regel und die Rechte der Bühne bleiben unberührt: die Migration fasst weder partner_assign_stage_guest noch can_edit_stage noch partner_format_sessions an", () => {
    const sql = code(migration());
    for (const n of ["partner_assign_stage_guest", "can_edit_stage", "can_edit_stage_slots", "partner_format_sessions", "create_slot", "delete_slot"]) {
      assert.ok(!new RegExp(`create or replace function ${n}\\(`).test(sql), n);
    }
  });
});

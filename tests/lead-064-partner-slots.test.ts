import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";
import { oeffnung } from "@/components/programme/oeffnung";
import { OHNE_ENDE } from "@/components/partner/standbuehne";

/**
 * K-84 / LEAD-064: Partner legen auf Standbühne und gebrandeter Bühne selbst Slots an. Die Datenbank-Seite belegt
 * `supabase/tests/v6_partner_slots.sql` (echter Rollenwechsel, 29 Erwartungen, Gegenstück zu jeder Abweisung, 37 von 38 Mutationen rot);
 * hier steht, was sich ohne Datenbank festhalten lässt — und ausgeführt wird, wo es geht: das Öffnungsfenster der gebrandeten Bühne im Board.
 * Der Rest sind Belege am Quelltext: Aufbau der Migration, der Löschweg im Board, die Texte, der Testdaten-Schritt und die Doku.
 */
const sql = () => migrationText("v6_partner_slots");
const code = (text: string) => text.replace(/--[^\n]*/g, "");
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const woerterbuch = (sprache: "de" | "en") =>
  JSON.parse(readFileSync(new URL(`../lib/i18n/${sprache}.json`, import.meta.url), "utf8"));

/** Rumpf einer Funktion aus der Migration, bis zum nächsten `$$;` (ohne Kommentare). */
function rumpf(name: string): string {
  const text = code(sql());
  const start = text.indexOf(`create or replace function ${name}(`);
  assert.ok(start >= 0, `${name} fehlt`);
  return text.slice(start, text.indexOf("$$;", start));
}

describe("K-84: die Migration v6_partner_slots (Aufbau)", () => {
  it("drei neue Funktionen, vier geänderte — und `can_edit_stage` selbst bleibt unberührt (an ihm hängt die Regie)", () => {
    const c = code(sql());
    for (const f of ["slot_outside_window", "can_edit_stage_slots", "delete_slot", "partner_window_binds", "partner_booth_window", "create_slot", "move_slot"]) {
      assert.match(c, new RegExp(`create or replace function ${f}\\(`), f);
    }
    // R1: der Helfer, nicht die Änderung von `can_edit_stage`
    assert.doesNotMatch(c, /create or replace function can_edit_stage\(/);
    assert.doesNotMatch(c, /create or replace function can_edit_regie\(/);
    assert.match(rumpf("can_edit_stage_slots"), /select can_edit_stage\(p_stage_id\)\s+or exists \(/);
  });

  it("der Helfer gilt nur für den Standbühnen-Editor im Scope Organisation auf der gebrandeten Bühne der eigenen Organisation", () => {
    const h = rumpf("can_edit_stage_slots");
    assert.match(h, /ra\.role = 'standbuehne_editor' and ra\.scope_type = 'org'/);
    assert.match(h, /st\.kind = 'branded' and st\.partner_org_id is not null and ra\.scope_id = st\.partner_org_id/);
  });

  it("create_slot und move_slot fragen den Helfer, nicht mehr `can_edit_stage`", () => {
    const c = rumpf("create_slot");
    const m = rumpf("move_slot");
    assert.match(c, /if not can_edit_stage_slots\(p_stage_id\) then\s+raise exception 'not allowed on this stage' using errcode = '42501';/);
    assert.match(m, /if p_stage_id <> v_slot\.stage_id and not can_edit_stage_slots\(p_stage_id\) then\s+raise exception 'not allowed on target stage'/);
    assert.doesNotMatch(c, /can_edit_stage\(/);
    assert.doesNotMatch(m, /can_edit_stage\(/);
  });

  it("das Fenster rechnet in Zeitpunkten: keine Uhrzeit-Vergleiche mehr, Stage-Lead-Rahmen, Partnerfenster und Warnungen über denselben Helfer", () => {
    for (const f of ["create_slot", "move_slot"]) {
      const r = rumpf(f);
      assert.doesNotMatch(r, /\(p_(start|end) at time zone v_tz\)::time/, `${f}: Uhrzeit-Vergleich`);
      assert.match(r, /slot_outside_window\(p_start, p_end, v_day\.day_date, v_sd\.open_from, v_sd\.open_to, v_tz\)/, `${f}: Stage-Lead-Rahmen`);
      assert.match(r, /slot_outside_window\(p_start, p_end, v_day\.day_date, v_win\.von, v_win\.bis, v_tz\)/, `${f}: Partnerfenster`);
      // die Fehlerschlüssel bleiben, ein Schlüssel je Regel (R5)
      assert.match(r, /raise exception 'outside_stage_day'/, f);
      assert.match(r, /raise exception 'outside_partner_window'/, f);
    }
    assert.match(rumpf("move_slot"), /slot_outside_window\(p_start, p_end, v_day\.day_date, v_sd\.open_from, null, v_tz\)[\s\S]*'before_open'/);
    assert.match(rumpf("move_slot"), /slot_outside_window\(p_start, p_end, v_day\.day_date, null, v_sd\.open_to, v_tz\)[\s\S]*'after_close'/);
    const h = rumpf("slot_outside_window");
    assert.match(h, /p_start < \(\(p_day \+ p_von\) at time zone p_tz\)/);
    assert.match(h, /p_end > \(\(p_day \+ p_bis\) at time zone p_tz\)/);
  });

  it("das Partner-Fenster gilt für Standbühne und gebrandete Bühne mit Partner, nicht für andere Arten; das Team bindet es nicht", () => {
    const b = rumpf("partner_window_binds");
    assert.match(b, /st\.kind in \('booth', 'branded'\) and st\.partner_org_id is not null/);
    assert.match(b, /ra\.role in \('admin', 'programme_team'\)/);
    assert.doesNotMatch(b, /type = 'partner_booth'/);
    const w = rumpf("partner_booth_window");
    assert.match(w, /where st\.id = p_stage_id and st\.kind in \('booth', 'branded'\)/);
    // je Grenze Öffnungszeit, sonst Tagesrahmen, sonst 24:00 — wie PART-090
    assert.match(w, /coalesce\(sd\.open_from, ed\.programme_start\)/);
    assert.match(w, /coalesce\(sd\.open_to, ed\.programme_end, time '24:00'\)/);
  });

  it("Partner legen nur Inhalts-Slots an (F2): die Regel hängt am Partner-Fenster, trifft das Team nicht und kennt den NULL-Fall", () => {
    const c = rumpf("create_slot");
    assert.match(c, /if p_slot_type is distinct from 'content' and partner_window_binds\(p_stage_id\) then\s+raise exception 'slot_type_not_allowed' using errcode = 'P0001', detail = coalesce\(p_slot_type, 'null'\);/);
  });

  it("delete_slot: Anmeldung, Recht NULL-sicher (Team jede Art, Partner nur Inhalts-Slots auf der Partnerbühne), Abweisungen, Audit mit Zustand davor", () => {
    const d = rumpf("delete_slot");
    assert.match(d, /if current_person_id\(\) is null then\s+raise exception 'not authenticated' using errcode = '28000';/);
    assert.match(d, /select \* into v_slot from slot where id = p_slot_id for update;\s+if not found then\s+raise exception 'slot not found' using errcode = 'P0002';/);
    assert.match(d, /if not coalesce\(is_programme_editor\(v_ev\)\s+or \(partner_window_binds\(v_slot\.stage_id\) and can_edit_slot\(p_slot_id\) and v_slot\.slot_type = 'content'\), false\) then\s+raise exception 'not allowed' using errcode = '42501';/);
    assert.match(d, /if v_se\.publish_status = 'published' then\s+raise exception 'unpublish_first' using errcode = 'P0001';/);
    assert.match(d, /a\.status in \('accepted', 'confirmed'\)/);
    assert.match(d, /raise exception 'slot_locked' using errcode = 'P0001', detail = v_n::text;/);
    assert.match(d, /delete from slot where id = p_slot_id;\s+perform log_audit\('slot\.delete', 'slot', p_slot_id::text, v_before, null\);/);
    assert.match(d, /'start_at', v_slot\.start_at, 'end_at', v_slot\.end_at,\s+'slot_type', v_slot\.slot_type, 'status', v_slot\.status, 'session_id', v_se\.id/);
    // keine Adresse im Audit
    assert.doesNotMatch(d, /email/i);
  });

  it("Rechte: die beiden Helfer sind intern, `delete_slot` bleibt für angemeldete Personen ausführbar, am Ende `harden_definer_functions()`", () => {
    const c = code(sql());
    assert.match(c, /revoke execute on function slot_outside_window\(timestamptz, timestamptz, date, time, time, text\) from public, anon, authenticated;/);
    assert.match(c, /revoke execute on function can_edit_stage_slots\(uuid\) from public, anon, authenticated;/);
    assert.doesNotMatch(c, /revoke execute on function delete_slot/);
    assert.match(c.trimEnd(), /select harden_definer_functions\(\);$/);
    for (const f of ["can_edit_stage_slots", "delete_slot", "create_slot", "move_slot", "partner_window_binds", "partner_booth_window"]) {
      assert.match(rumpf(f).concat(c.slice(c.indexOf(`function ${f}(`), c.indexOf(`function ${f}(`) + 400)), /SECURITY DEFINER[\s\S]*SET search_path TO 'public', 'extensions'/, f);
    }
  });

  it("der DB-Test hat 29 Erwartungen und deckt jede Abweisung ab (Schlüssel und Fehlercodes stehen in den Mustern)", () => {
    const t = quelle("supabase/tests/v6_partner_slots.sql");
    const erwartungen = t.slice(t.indexOf("insert into t_erw values"), t.indexOf("create function pg_temp.zz_ts"));
    assert.equal((erwartungen.match(/^  \('/gm) ?? []).length, 29);
    for (const muster of ["slot_type_not_allowed", "outside_partner_window", "outside_stage_day", "slot_blocked", "stage_not_valid_that_day",
      "unpublish_first", "slot_locked", "confirmation_required", "42501", "28000", "P0002", "23P01", "22023"]) {
      assert.ok(erwartungen.includes(muster), `Muster ${muster} fehlt im DB-Test`);
    }
    // echter Rollenwechsel und die Rolle `authenticated`
    assert.match(t, /execute 'set local role authenticated';/);
    assert.match(t, /perform pg_temp\.zz_rolle\(v_pid, 'standbuehne_editor', 'org', o_b\);/);
    assert.match(quelle("supabase/tests/README.md"), /\| `v6_partner_slots\.sql` \|/);
  });
});

describe("K-84: das Öffnungsfenster der gebrandeten Bühne im Board (ausgeführt)", () => {
  const tag = { programme_start: "09:00:00", programme_end: "18:00:00" };
  const zeile = (von: string | null, bis: string | null) => [{ stage_id: "s", open_from: von, open_to: bis }];
  const gebrandet = { id: "s", type: "main", kind: "branded" };
  const stand = { id: "s", type: "partner_booth", kind: "booth" };
  const haupt = { id: "s", type: "main", kind: "main" };

  it("mit Öffnungszeiten gelten sie — wie auf der Standbühne", () => {
    assert.deepEqual(oeffnung(gebrandet, zeile("10:00:00", "16:00:00"), tag), { von: 600, bis: 960 });
    assert.deepEqual(oeffnung(stand, zeile("10:00:00", "16:00:00"), tag), { von: 600, bis: 960 });
  });

  it("ohne Zeile oder mit einer fehlenden Grenze gilt je Grenze der Programmrahmen des Tages", () => {
    assert.deepEqual(oeffnung(gebrandet, [], tag), { von: 540, bis: 1080 });
    assert.deepEqual(oeffnung(gebrandet, zeile("10:00:00", null), tag), { von: 600, bis: 1080 });
    assert.deepEqual(oeffnung(gebrandet, zeile(null, "16:00:00"), tag), { von: 540, bis: 960 });
    assert.deepEqual(oeffnung(gebrandet, [], tag), oeffnung(stand, [], tag));
  });

  it("ganz ohne Rahmen keine Grenze: nichts zu schraffieren (24:00 heißt kein Ende)", () => {
    assert.ok(OHNE_ENDE >= 1440);
    assert.equal(oeffnung(gebrandet, [], { programme_start: null, programme_end: null }), null);
    assert.equal(oeffnung(gebrandet, [], null), null);
  });

  it("eine Hauptbühne ohne Partner hat keinen Rückfall auf den Programmrahmen — nur die eigenen Öffnungszeiten (Gegenstück)", () => {
    assert.equal(oeffnung(haupt, [], tag), null);
    assert.deepEqual(oeffnung(haupt, zeile("10:00:00", "16:00:00"), tag), { von: 600, bis: 960 });
    assert.deepEqual(oeffnung(haupt, zeile("10:00:00", null), tag), { von: 600, bis: null });
    // ohne `kind` (ältere Aufrufer) bleibt es bei der bisherigen Regel
    assert.equal(oeffnung({ id: "s", type: "main" }, [], tag), null);
  });
});

describe("K-84: Löschweg, Fehlermeldungen und Texte", () => {
  it("die Aktion ruft nur `delete_slot` und lädt alle drei Board-Seiten neu", () => {
    const a = quelle("components/programme/actions.ts");
    assert.match(a, /export async function deleteSlot\(slotId: string\): Promise<ActionResult> \{\s+const supabase = await client\(\);\s+const \{ error \} = await supabase\.rpc\("delete_slot", \{ p_slot_id: slotId \}\);\s+if \(error\) return fail\(error\);\s+revalidateBoard\(\);/);
  });

  it("das Schubfach zeigt „Slot löschen“ nur auf Wunsch des Boards, fragt zurück und schließt nach dem Löschen", () => {
    const s = quelle("components/programme/SessionDrawer.tsx");
    assert.match(s, /canDeleteSlot = false,/);
    assert.match(s, /\{canDeleteSlot && \(\s+<div className="sm:col-span-2">\s+<Button variant="ghost" size="sm" disabled=\{pending\} onClick=\{\(\) => setLoeschenOffen\(true\)\}>\s+\{t\.deleteSlot\}/);
    assert.match(s, /const res = await deleteSlot\(slotId\);\s+setLoeschenOffen\(false\);\s+if \(report\(res, t\.slotDeleted\)\) onClose\(\);/);
    assert.match(s, /body=\{id \? t\.deleteSlotBodySession : t\.deleteSlotBody\}/);
    assert.match(s, /\{loeschenOffen && slotId && \(\s+<ConfirmDialog/);
  });

  it("das Board bietet es dem Programm-Team (Sicht ohne `editableStageIds`) und dem Partner (nur Inhalts-Slots), Stage Leads nicht", () => {
    const b = quelle("components/programme/Board.tsx");
    assert.match(b, /const slotLoeschbar =\s+zeitAenderbar && \(partner \? \(zeitSlot\?\.slot_type \?\? "content"\) === "content" : editableStageIds === undefined\);/);
    assert.match(b, /canDeleteSlot=\{slotLoeschbar\}/);
  });

  it("das Fenster der gebrandeten Bühne kennt auch die Anzeige im Board", () => {
    const o = quelle("components/programme/oeffnung.ts");
    assert.match(o, /if \(stage\.type === "partner_booth" \|\| stage\.kind === "branded"\) \{/);
    assert.match(o, /stage: \{ id: string; type: string \| null; kind\?: string \| null \}/);
  });

  it("der neue Fehlerschlüssel ist Geschäftsschlüssel und in beiden Sprachen übersetzt; `unpublish_first` und `slot_locked` bleiben", () => {
    const rpc = quelle("lib/rpc-error.ts");
    for (const k of ["slot_type_not_allowed", "unpublish_first", "slot_locked", "outside_partner_window"]) {
      assert.match(rpc, new RegExp(`"${k}",`), k);
      for (const sprache of ["de", "en"] as const) {
        const text = woerterbuch(sprache).rpc[k];
        assert.equal(typeof text, "string", `${sprache}.rpc.${k}`);
        assert.ok(text.trim().length > 0, `${sprache}.rpc.${k} ist leer`);
      }
    }
    // die Meldung zum Fenster spricht nicht mehr nur von der Standbühne, die zum Zurückziehen nicht mehr nur vom Lösen vom Slot
    assert.doesNotMatch(woerterbuch("de").rpc.outside_partner_window, /Standbühne/);
    assert.doesNotMatch(woerterbuch("en").rpc.outside_partner_window, /stand stage/i);
    assert.doesNotMatch(woerterbuch("de").rpc.unpublish_first, /vom Slot lösen/);
    assert.match(woerterbuch("de").rpc.slot_type_not_allowed, /Inhalts-Slots/);
    assert.match(woerterbuch("en").rpc.slot_type_not_allowed, /content slots/);
  });

  it("die Beschriftungen des Löschens stehen in DE und EN", () => {
    for (const sprache of ["de", "en"] as const) {
      const p = woerterbuch(sprache).admin.programme;
      for (const k of ["deleteSlot", "deleteSlotTitle", "deleteSlotBody", "deleteSlotBodySession", "slotDeleted"]) {
        assert.ok(typeof p[k] === "string" && p[k].trim() !== "", `${sprache}.admin.programme.${k}`);
      }
      // die Rückfrage nennt, was mit einer Session am Slot geschieht
      assert.match(p.deleteSlotBodySession, sprache === "de" ? /Backlog/ : /backlog/i);
    }
  });
});

describe("K-84: Testdaten für Konrads Konto und Doku", () => {
  it("der Schritt `partnerslots` legt eine gebrandete TEST-Bühne der Test-Organisation mit Öffnungszeiten an — erst nach „Migration live“", () => {
    const s = quelle("scripts/testdaten-konrad.mjs");
    assert.match(s, /partnerslots: partnerslotsSchritt,/);
    assert.match(s, /const GEBRANDET_SLUG = "zz-test-gebrandet";/);
    assert.match(s, /admin\.rpc\("delete_slot", \{ p_slot_id: "00000000-0000-0000-0000-000000000000" \}\);\s+if \(probe\?\.code === "PGRST202"\)/);
    assert.match(s, /type: "main", partner_org_id: org\.id,/);
    assert.match(s, /\{ tag: tage\[0\], von: "14:00", bis: "18:00" \},/);
    assert.match(s, /admin\.from\("stage"\)\.delete\(\)\.eq\("slug", GEBRANDET_SLUG\)/);
    // der Name trägt das Präfix, an dem `--remove` und Konrad die TEST-Zeilen erkennen
    assert.match(s, /name: `\$\{PREFIX\}Eure Bühne \(gebrandet\)`/);
    assert.match(s, /--apply --nur=partnerslots/);
  });

  it("Testleitfaden und Testdaten-Doku sagen, wo Konrad klickt", () => {
    // Die Texte stehen so im Repo; schlägt es fehl, nennt die Meldung nur den Anker (die Dateien sind groß).
    assert.ok(/\*\*Partner legt auf seiner Bühne selbst Slots an \(K-84, LEAD-064\)\*\*/.test(quelle("docs/team-testleitfaden.md")), "Testleitfaden: Zeile K-84 fehlt");
    assert.ok(/\*\*Partner-Slots \(K-84, LEAD-064\):\*\* `--apply --nur=partnerslots`/.test(quelle("docs/testdaten-konrad.md")), "Testdaten-Doku: Absatz K-84 fehlt");
  });
});

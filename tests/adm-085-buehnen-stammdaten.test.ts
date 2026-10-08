import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";
import {
  HAUPT_ARTEN,
  imFenster,
  istHauptbuehne,
  leseBuehnenWahl,
  sichtbareBuehnen,
  sperrenDerBuehne,
  sperrzeitenAmTag,
  type Sperrzeit,
} from "@/components/programme/buehnen";
import { feldZeit, gewaehlteTage, tageSpeichern, zeitFeld } from "@/app/(admin)/admin/edition/felder";
import { BUEHNEN_ARTEN, BUEHNEN_KINDS } from "@/app/(admin)/admin/edition/types";

/**
 * ADM-085 / LEAD-061 / LEAD-062: Art der Bühne (`stage.kind`), Gültigkeitstage und Sperrzeiten. Die Datenbank-Seite belegt
 * `supabase/tests/v6_buehnen_stammdaten.sql` (echter Rollenwechsel, 59 Erwartungen, Gegenstücke zu jeder Abweisung); hier steht, was sich
 * ohne Datenbank festhalten lässt — und **ausgeführt** wird, nicht nur gelesen: die Auswahl der Bühnen, die Zuschnitte der Sperrzeiten
 * (Zeitumstellung inbegriffen) und die Feld-Helfer des Gerüsts (Lehre aus dem Hotfix #373: Quelltext lesen belegt nicht, dass es läuft).
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const code = (text: string) => text.replace(/--[^\n]*/g, "");
const woerterbuch = (sprache: "de" | "en") =>
  JSON.parse(readFileSync(new URL(`../lib/i18n/${sprache}.json`, import.meta.url), "utf8"));

const ZONE = "Europe/Berlin";
const T1 = "2027-04-16";
const T2 = "2027-04-17";

describe("ADM-085: Hauptbühnen und Bühnenwahl", () => {
  it("Hauptbühnen sind die ChefTreff-Bühnen und die gebrandeten — nichts sonst", () => {
    assert.deepEqual([...HAUPT_ARTEN], ["main", "branded"]);
    for (const k of ["main", "branded"]) assert.equal(istHauptbuehne(k), true, k);
    for (const k of ["booth", "masterclass", "interview_table", "side_event", "", null, undefined]) {
      assert.equal(istHauptbuehne(k), false, String(k));
    }
  });

  it("die Wahl kennt „haupt“ und sonst alles", () => {
    assert.equal(leseBuehnenWahl("haupt"), "haupt");
    for (const p of [undefined, "", "alle", "Haupt", "main", "haupt "]) assert.equal(leseBuehnenWahl(p), "alle", String(p));
  });

  const buehnen = [
    { id: "m", kind: "main", valid_days: [] },
    { id: "b", kind: "branded", valid_days: [] },
    { id: "s", kind: "booth", valid_days: [] },
    { id: "r", kind: "masterclass", valid_days: [] },
    { id: "t1", kind: "main", valid_days: [T1] },
    { id: "alt", kind: null, valid_days: undefined },
  ];
  const ids = (l: readonly { id: string }[]) => l.map((x) => x.id);

  it("alle Bühnen: keine fällt weg, solange ihre Tage passen", () => {
    assert.deepEqual(ids(sichtbareBuehnen(buehnen, { tag: T1, wahl: "alle" })), ["m", "b", "s", "r", "t1", "alt"]);
  });

  it("Hauptbühnen: nur main und branded; die eigene Bühne eines Leads bleibt in jedem Fall", () => {
    assert.deepEqual(ids(sichtbareBuehnen(buehnen, { tag: T1, wahl: "haupt" })), ["m", "b", "t1"]);
    assert.deepEqual(ids(sichtbareBuehnen(buehnen, { tag: T1, wahl: "haupt", immer: new Set(["s", "alt"]) })), ["m", "b", "s", "t1", "alt"]);
  });

  it("Gültigkeitstage: eine Bühne ohne Gültigkeit an diesem Tag verschwindet — es sei denn, es hängt schon ein Slot dran", () => {
    assert.deepEqual(ids(sichtbareBuehnen(buehnen, { tag: T2, wahl: "alle" })), ["m", "b", "s", "r", "alt"]);
    assert.deepEqual(ids(sichtbareBuehnen(buehnen, { tag: T2, wahl: "alle", mitSlots: new Set(["t1"]) })), ["m", "b", "s", "r", "t1", "alt"]);
    assert.deepEqual(ids(sichtbareBuehnen(buehnen, { tag: T2, wahl: "alle", immer: new Set(["t1"]) })), ["m", "b", "s", "r", "t1", "alt"]);
    // ohne Tag keine Gültigkeitsprüfung
    assert.deepEqual(ids(sichtbareBuehnen(buehnen, { tag: null, wahl: "alle" })), ["m", "b", "s", "r", "t1", "alt"]);
  });
});

describe("ADM-085: Sperrzeiten im Board (ausgeführt, in der Zeit des Events)", () => {
  const z = (id: string, stage: string | null, von: string, bis: string, grund = "Opening"): Sperrzeit => ({
    id,
    event_id: "e",
    stage_id: stage,
    stage_name: stage,
    starts_at: von,
    ends_at: bis,
    reason: grund,
    slots_affected: 0,
  });

  it("eine Sperrzeit am Tag: Minuten seit Mitternacht in der Zeit des Events (Sommerzeit: UTC+2)", () => {
    const r = sperrzeitenAmTag([z("a", "s1", "2027-04-16T08:00:00Z", "2027-04-16T10:00:00Z")], T1, ZONE);
    assert.deepEqual(r, [{ id: "a", stage_id: "s1", von: 600, bis: 720, grund: "Opening" }]);
    assert.deepEqual(sperrzeitenAmTag([z("a", "s1", "2027-04-16T08:00:00Z", "2027-04-16T10:00:00Z")], T2, ZONE), []);
  });

  it("Winterzeit (UTC+1) rechnet anders — dieselbe Wanduhrzeit, anderer Zeitpunkt", () => {
    const r = sperrzeitenAmTag([z("w", null, "2027-01-15T09:00:00Z", "2027-01-15T11:00:00Z")], "2027-01-15", ZONE);
    assert.deepEqual(r.map((x) => [x.von, x.bis]), [[600, 720]]);
  });

  it("über Mitternacht: jeder Tag bekommt seinen Anteil", () => {
    const l = [z("n", null, "2027-04-16T18:00:00Z", "2027-04-17T04:00:00Z", "Nacht")]; // 20:00 → 06:00 Ortszeit
    assert.deepEqual(sperrzeitenAmTag(l, T1, ZONE).map((x) => [x.von, x.bis]), [[1200, 1440]]);
    assert.deepEqual(sperrzeitenAmTag(l, T2, ZONE).map((x) => [x.von, x.bis]), [[0, 360]]);
  });

  it("endet die Sperrzeit genau um 00:00, berührt sie den neuen Tag nicht (halboffen, wie die Datenbank)", () => {
    const l = [z("m", null, "2027-04-16T18:00:00Z", "2027-04-16T22:00:00Z")]; // 20:00 → 00:00 Ortszeit
    assert.deepEqual(sperrzeitenAmTag(l, T1, ZONE).map((x) => [x.von, x.bis]), [[1200, 1440]]);
    assert.deepEqual(sperrzeitenAmTag(l, T2, ZONE), []);
  });

  it("mehrere Sperrzeiten sind nach Beginn sortiert", () => {
    const l = [z("b", null, "2027-04-16T12:00:00Z", "2027-04-16T13:00:00Z", "Pause"), z("a", null, "2027-04-16T07:00:00Z", "2027-04-16T08:00:00Z", "Einlass")];
    assert.deepEqual(sperrzeitenAmTag(l, T1, ZONE).map((x) => x.grund), ["Einlass", "Pause"]);
  });

  it("je Bühne zählen die der Bühne und die für alle; auf das Fenster zugeschnitten fällt weg, was draußen liegt", () => {
    const s = [
      { id: "1", stage_id: "a", von: 600, bis: 720, grund: "x" },
      { id: "2", stage_id: null, von: 800, bis: 900, grund: "y" },
      { id: "3", stage_id: "b", von: 600, bis: 700, grund: "z" },
    ];
    assert.deepEqual(sperrenDerBuehne(s, "a").map((x) => x.id), ["1", "2"]);
    assert.deepEqual(sperrenDerBuehne(s, "c").map((x) => x.id), ["2"]);
    assert.deepEqual(imFenster(s, 650, 850).map((x) => [x.id, x.von, x.bis]), [["1", 650, 720], ["2", 800, 850], ["3", 650, 700]]);
    assert.deepEqual(imFenster(s, 1000, 1200), []);
  });
});

describe("ADM-085: Felder des Gerüsts (ausgeführt)", () => {
  const alle = [T1, T2];

  it("Gültigkeitstage: leer gespeichert zeigt alle angehakt; ein Entwurf gewinnt; nichts gewählt bleibt leer", () => {
    assert.deepEqual(gewaehlteTage(undefined, [], alle), alle);
    assert.deepEqual(gewaehlteTage(undefined, [T2], alle), [T2]);
    assert.deepEqual(gewaehlteTage(`${T1}`, [T2], alle), [T1]);
    assert.deepEqual(gewaehlteTage("", [T2], alle), []);
  });

  it("zum Speichern: alle Tage heißt leer, sonst die Auswahl", () => {
    assert.deepEqual(tageSpeichern(`${T1},${T2}`, alle), []);
    assert.deepEqual(tageSpeichern(T2, alle), [T2]);
    assert.deepEqual(tageSpeichern("", []), []);
  });

  it("Zeiten im Feld sind Ortszeit des Events; der Weg hin und zurück ist verlustfrei, Zeitumstellung inbegriffen", () => {
    assert.equal(zeitFeld("2027-04-16T08:00:00Z", ZONE), "2027-04-16T10:00");
    assert.equal(feldZeit("2027-04-16T10:00", ZONE), "2027-04-16T08:00:00.000Z");
    assert.equal(zeitFeld("2027-01-15T09:00:00Z", ZONE), "2027-01-15T10:00");
    assert.equal(feldZeit("2027-01-15T10:00", ZONE), "2027-01-15T09:00:00.000Z");
    // Die Stunde der Zeitumstellung im Herbst (02:30 kommt zweimal) lässt sich in einem Feld nicht ausdrücken — Sperrzeiten liegen im Frühjahr.
    for (const iso of ["2027-04-16T08:00:00.000Z", "2027-03-28T01:30:00.000Z", "2027-10-31T02:30:00.000Z", "2027-01-15T23:45:00.000Z"]) {
      assert.equal(feldZeit(zeitFeld(iso, ZONE), ZONE), iso, iso);
    }
  });

  it("ein unlesbares Feld ergibt einen leeren Text, nie einen Fehler", () => {
    for (const v of ["", "kaputt", "2027-04-16", "2027-04-16 10:00", "2027-04-16T10", "T10:00"]) assert.equal(feldZeit(v, ZONE), "", v);
  });
});

describe("ADM-085: Board, Seiten und Meldungen", () => {
  it("der Loader holt Art und Gültigkeitstage, filtert mit den reinen Funktionen und zeigt nur Slots der gezeigten Bühnen", () => {
    const l = quelle("components/programme/load.ts");
    assert.match(l, /\.select\("id, name, slug, type, kind, valid_days, room, sort_order, changeover_min, default_duration_min"\)/);
    assert.match(l, /supabase\.rpc\("stage_blocked_times", \{ p_event_id: currentEvent\.id \}\)/);
    assert.match(l, /sichtbareBuehnen\(\(stageRows \?\? \[\]\) as BoardStage\[\], \{/);
    assert.match(l, /wahl: input\.buehnen \?\? "alle"/);
    assert.match(l, /slots: alleSlots\.filter\(\(s\) => sichtbar\.has\(s\.stage_id\)\)/);
    assert.match(l, /sperrzeitenAmTag\(\(sperrRows \?\? \[\]\) as Sperrzeit\[\], currentDay\.day_date, currentEvent\.timezone\)/);
  });

  it("das Stage-Lead-Board zeigt fest die Hauptbühnen, die eigene Bühne des Leads bleibt; /admin/programm lässt das Team wählen", () => {
    const lead = quelle("app/(speaker-leads)/speaker-leads/board/page.tsx");
    assert.match(lead, /buehnen: "haupt",\s+immerBuehnen: scope\.stages\.map\(\(s\) => s\.id\),/);
    assert.match(lead, /sperrzeiten=\{board\.sperrzeiten\}/);
    const admin = quelle("app/(admin)/admin/programm/page.tsx");
    assert.match(admin, /const wahl = leseBuehnenWahl\(buehnen\);/);
    assert.match(admin, /loadBoard\(\{ eventSlug: event, day: tag, buehnen: wahl \}\)/);
    assert.match(admin, /\(\["alle", "haupt"\] as const\)\.map/);
    assert.match(admin, /linkZusatz=\{wahl === "haupt" \? "&buehnen=haupt" : ""\}/);
    assert.match(quelle("app/(partner)/partner/buehne/page.tsx"), /sperrzeiten=\{board\.sperrzeiten\}/);
  });

  it("das Board zeichnet Sperrzeiten als Schraffur mit Grund, nennt sie als Text und behält die Wahl beim Wechsel von Tag und Veranstaltung", () => {
    const b = quelle("components/programme/Board.tsx");
    assert.match(b, /sperrzeiten = \[\],\s+linkZusatz = "",/);
    assert.match(b, /href=\{`\$\{basePath\}\?event=\$\{e\.slug\}\$\{linkZusatz\}`\}/);
    assert.match(b, /href=\{`\$\{basePath\}\?event=\$\{currentEventSlug\}&tag=\$\{d\.day_date\}\$\{linkZusatz\}`\}/);
    assert.match(b, /sperren=\{sperrenJeBuehne\.get\(stage\.id\) \?\? \[\]\}/);
    assert.match(b, /\{sperren\.map\(\(b\) => \(\s+<div\s+key=\{`sperre-\$\{b\.id\}-\$\{b\.von\}`\}\s+aria-hidden\s+className="pointer-events-none absolute inset-x-0 bg-hatch-closed"/);
    assert.match(b, /\{t\.blockedLegend\}/);
    assert.match(b, /\{t\.blockedNote\}: /);
  });

  it("die Fehler tragen ihren Grund bis in die Meldung: slot_blocked und stage_not_valid_that_day stehen unter den lesbaren Details", () => {
    const f = quelle("components/programme/fehler.ts");
    assert.match(f, /"slot_blocked",\s+"stage_not_valid_that_day",\s+\]\);/);
  });

  it("die fünf Fehlerschlüssel sind Geschäftsschlüssel und in beiden Wörterbüchern übersetzt", () => {
    const rpc = quelle("lib/rpc-error.ts");
    const schluessel = ["slot_blocked", "stage_not_valid_that_day", "invalid_valid_day", "invalid_blocked_time", "blocked_time_not_found"];
    for (const k of schluessel) {
      assert.match(rpc, new RegExp(`"${k}",`), k);
      for (const sprache of ["de", "en"] as const) {
        const text = woerterbuch(sprache).rpc[k];
        assert.equal(typeof text, "string", `${sprache}.rpc.${k}`);
        assert.ok(text.trim().length > 0, `${sprache}.rpc.${k} ist leer`);
      }
    }
  });

  it("die neuen Texte der Gerüst-Seite und des Boards gibt es in beiden Sprachen, die Platzhalter stehen mit", () => {
    const edition = [
      "stageType_interview_table", "stageType_side_event_venue", "colKind", "colValidDays", "brandedBy", "validDaysHint", "validDaysNone",
      "blockedTitle", "blockedHint", "blockedStage", "blockedAllStages", "blockedFrom", "blockedTo", "blockedReason", "blockedReasonHint",
      "blockedAffects", "blockedSlots", "blockedSlotOne", "blockedNone", "blockedAdd", "blockedEmpty", "blockedAffected", "blockedAffectedOne", "blockedZone",
      "blockedIncomplete",
      ...BUEHNEN_KINDS.map((k) => `kind_${k}`),
    ];
    const board = ["stagesFilter", "stagesAll", "stagesMain", "blockedLegend", "blockedNote", "blockedAllStages"];
    for (const sprache of ["de", "en"] as const) {
      const w = woerterbuch(sprache);
      for (const k of edition) assert.ok(typeof w.adminEdition[k] === "string" && w.adminEdition[k].trim() !== "", `${sprache}.adminEdition.${k}`);
      for (const k of board) assert.ok(typeof w.admin.programme[k] === "string" && w.admin.programme[k].trim() !== "", `${sprache}.admin.programme.${k}`);
      assert.match(w.adminEdition.brandedBy, /\{partner\}/, sprache);
      assert.match(w.adminEdition.blockedSlots, /\{n\}/, sprache);
      assert.match(w.adminEdition.blockedAffected, /\{n\}/, sprache);
      // der Singular trägt die Zahl selbst und keinen Platzhalter
      assert.doesNotMatch(w.adminEdition.blockedSlotOne, /\{n\}/, sprache);
      assert.doesNotMatch(w.adminEdition.blockedAffectedOne, /\{n\}/, sprache);
      assert.match(w.adminEdition.blockedZone, /\{zone\}/, sprache);
      // jede Bühnenart des Formulars hat eine Beschriftung
      for (const a of BUEHNEN_ARTEN) assert.ok(typeof w.adminEdition[`stageType_${a}`] === "string", `${sprache}.adminEdition.stageType_${a}`);
    }
  });

  it("die Bühnenarten des Formulars sind genau die Typen der Abbildung in der Datenbank, die Arten genau ihre Ergebnisse", () => {
    const sql = code(migrationText("v6_buehnen_stammdaten"));
    const abbildung = sql.slice(sql.indexOf("add column if not exists kind"), sql.indexOf("end) stored;"));
    const typen = new Set<string>();
    for (const m of abbildung.matchAll(/when type in \(([^)]*)\)/g)) for (const x of m[1].matchAll(/'([a-z_]+)'/g)) typen.add(x[1]);
    for (const m of abbildung.matchAll(/when type = '([a-z_]+)'/g)) typen.add(m[1]);
    assert.deepEqual([...typen].sort(), [...BUEHNEN_ARTEN].sort());
    const arten = new Set([...abbildung.matchAll(/then '([a-z_]+)'/g)].map((m) => m[1]));
    assert.deepEqual([...arten].sort(), [...BUEHNEN_KINDS].sort());
  });
});

describe("ADM-085: die Pflege unter /admin/edition", () => {
  it("die Aktionen laufen hinter dem Abschnitt „edition“ und rufen nur die RPCs", () => {
    const a = quelle("app/(admin)/admin/edition/actions.ts");
    assert.match(a, /async function client\(\) \{\s+await requireAdminSection\("edition", PATH\);/);
    assert.match(a, /supabase\.rpc\("upsert_stage_blocked_time", \{ p_data: data \}\)/);
    assert.match(a, /return rpc\("delete_stage_blocked_time", \{ p_id: id \}\);/);
    assert.match(a, /typeof r\.affected === "number" \? r\.affected : 0/);
  });

  it("die Seite liest die Sperrzeiten als Zugabe; die Oberfläche speichert Tage als Liste, alle Tage = leer, und sendet die gezeigte Art mit", () => {
    const p = quelle("app/(admin)/admin/edition/page.tsx");
    assert.match(p, /supabase\.rpc\("stage_blocked_times", \{ p_event_id: geruest\.event\.id \}\)/);
    assert.match(p, /dateLocale=\{t\.meta\.dateLocale\}/);
    const v = quelle("app/(admin)/admin/edition/GeruestView.tsx");
    assert.match(v, /onClick=\{\(\) => lauf\(\(\) => saveStage\(buehnenDaten\(s\)\), t\.saved\)\}/);
    assert.match(v, /disabled=\{pending \|\| !geaendert\(s\.id\) \|\| keineTage\(s\.id\)\}/);
    // ein neues Formular schickt die angezeigten Standardwerte der Auswahl und der Tage mit, aber keine leeren Zahlenfelder
    assert.match(v, /if \(neu\[f\.key\] === undefined && \(f\.options \|\| f\.tage\)\) neu\[f\.key\] = angezeigt\(f\);/);
    assert.match(v, /\{ key: "valid_days", label: t\.colValidDays, tage: true \}/);
    // Sperrzeiten: Zeit in der Event-Zone, Hinweis auf vorhandene Slots
    assert.match(v, /starts_at: feldZeit\(von, zone\),\s+ends_at: feldZeit\(bis, zone\),/);
    assert.match(v, /n === 1 \? t\.blockedAffectedOne : t\.blockedAffected\.replace\("\{n\}", String\(n\)\)/);
    assert.match(v, /b\.slots_affected === 1 \? t\.blockedSlotOne : t\.blockedSlots\.replace\("\{n\}", String\(b\.slots_affected\)\)/);
  });
});

describe("ADM-085: die Migration `v6_buehnen_stammdaten`", () => {
  const sql = () => migrationText("v6_buehnen_stammdaten");

  it("Art ist eine generierte Spalte (nie geschrieben), Gültigkeitstage leer = alle", () => {
    const c = code(sql());
    assert.match(c, /alter table stage add column if not exists kind text generated always as \(/);
    assert.match(c, /\) stored;/);
    assert.match(c, /alter table stage add column if not exists valid_days date\[\] not null default '\{\}';/);
    assert.match(c, /when type in \('main', 'side'\) and partner_org_id is null then 'main'/);
    assert.match(c, /when type in \('main', 'side'\) then 'branded'/);
    assert.match(c, /when type = 'partner_booth' then 'booth'/);
    assert.match(c, /when type = 'room' then 'masterclass'/);
    assert.match(c, /when type = 'interview_table' then 'interview_table'/);
    assert.match(c, /when type = 'side_event_venue' then 'side_event'/);
    assert.match(c, /grant select \(kind, valid_days\) on stage to authenticated;/);
  });

  it("die vier ChefTreff-Bühnen werden gezielt über Event und Namen Hauptbühnen", () => {
    const c = code(sql());
    assert.match(c, /update stage st set type = 'main'\s+where st\.type = 'side'\s+and st\.partner_org_id is null\s+and st\.name in \('Leadership & Growth Stage', 'Industry Stage', 'Startup Stage', 'Impact & Tech Stage'\)/);
    assert.match(c, /e\.format_tag = 'summit'/);
  });

  it("Sperrzeiten: Tabelle mit RLS und ohne Grants, Prüfregeln, nur drei Wege hinein", () => {
    const c = code(sql());
    assert.match(c, /create table if not exists stage_blocked_time \(/);
    assert.match(c, /constraint stage_blocked_time_range_chk check \(ends_at > starts_at\)/);
    assert.match(c, /constraint stage_blocked_time_reason_chk check \(length\(btrim\(reason\)\) between 1 and 200\)/);
    assert.match(c, /alter table stage_blocked_time enable row level security;/);
    assert.match(c, /revoke all on stage_blocked_time from anon, authenticated;/);
    assert.doesNotMatch(c, /grant (select|insert|update|delete|all)[^;]*on stage_blocked_time to (anon|authenticated)/);
    assert.match(c, /raise exception 'stage_not_found' using errcode = 'P0002', detail = 'stage_event_mismatch';/);
  });

  it("Schreiben und Löschen hinter dem Abschnitt `programme`, mit Audit; Lesen für Board-Nutzer und Abschnitts-Inhaber", () => {
    const c = code(sql());
    const upsert = c.slice(c.indexOf("create or replace function upsert_stage_blocked_time"), c.indexOf("create or replace function delete_stage_blocked_time"));
    assert.match(upsert, /if not has_admin_section\('programme'\) then raise exception 'not allowed' using errcode = '42501'; end if;/);
    assert.match(upsert, /perform log_audit\('programme\.blocked_time_upsert'/);
    const del = c.slice(c.indexOf("create or replace function delete_stage_blocked_time"));
    assert.match(del, /if not has_admin_section\('programme'\)/);
    assert.match(del, /perform log_audit\('programme\.blocked_time_delete'/);
    assert.match(c, /if not \(is_programme_board_user\(\) or has_admin_section\('programme'\)\) then raise exception 'not allowed' using errcode = '42501'; end if;/);
  });

  it("die Prüfung: Gültigkeitstage für jede Slot-Art, Sperrzeiten nur für Inhalts-Slots, halboffen, Bühne oder alle", () => {
    const c = code(sql());
    const h = c.slice(c.indexOf("create or replace function stage_slot_check"), c.indexOf("create or replace function stage_blocked_times"));
    assert.match(h, /if cardinality\(v_stage\.valid_days\) > 0 and not \(v_date = any \(v_stage\.valid_days\)\) then\s+raise exception 'stage_not_valid_that_day'/);
    assert.match(h, /if p_slot_type = 'content' then/);
    assert.match(h, /\(b\.stage_id is null or b\.stage_id = p_stage_id\)/);
    assert.match(h, /tstzrange\(b\.starts_at, b\.ends_at, '\[\)'\) && tstzrange\(p_start, p_end, '\[\)'\)/);
    assert.match(h, /raise exception 'slot_blocked' using errcode = 'P0001'/);
  });

  it("alle drei Funktionen, die Slot-Zeiten schreiben, rufen die Prüfung — move_slot **vor** der Rückfrage zur Veröffentlichung", () => {
    const c = code(sql());
    assert.equal((c.match(/perform stage_slot_check\(/g) ?? []).length, 3);
    assert.match(c, /perform stage_slot_check\(p_stage_id, p_start, p_end, p_slot_type\);/);
    assert.match(c, /perform stage_slot_check\(p_stage_id, p_start, p_end, v_slot\.slot_type\);\s+select exists \(select 1 from session se where se\.slot_id = p_slot_id and se\.publish_status = 'published'\)/);
    assert.match(c, /perform stage_slot_check\(p_stage_id, p_start, p_end, 'partner_block'\);/);
    // die Funktion, die Slots schreibt, ohne Zeiten zu ändern, bleibt unberührt
    for (const f of ["attach_session_to_slot", "set_slot_status", "publish_session"]) assert.doesNotMatch(c, new RegExp(`create or replace function ${f}\\(`));
  });

  it("upsert_stage: Standardart main, Gültigkeitstage gegen event_day geprüft, sortiert und ohne Dubletten; programme_skeleton liefert Art und Tage", () => {
    const c = code(sql());
    assert.match(c, /coalesce\(v_type, 'main'\),/);
    assert.doesNotMatch(c, /coalesce\(v_type, 'side'\)/);
    assert.match(c, /exists \(select 1 from event_day ed where ed\.event_id = v_event and ed\.day_date = v_day\)/);
    assert.match(c, /array_agg\(distinct x order by x\)/);
    assert.match(c, /'kind', st\.kind, 'valid_days', st\.valid_days,/);
  });

  it("der Helfer ist nur intern, die drei Funktionen sind für authenticated, die Migration endet mit der Härtung", () => {
    const c = code(sql());
    assert.match(c, /revoke execute on function stage_slot_check\(uuid, timestamptz, timestamptz, text\) from public, anon, authenticated;/);
    for (const f of ["stage_blocked_times(uuid)", "upsert_stage_blocked_time(jsonb)", "delete_stage_blocked_time(uuid)"]) {
      assert.match(c, new RegExp(`revoke execute on function ${f.replace(/[()]/g, "\\$&")} from public, anon;`), f);
      assert.match(c, new RegExp(`grant execute on function ${f.replace(/[()]/g, "\\$&")} to authenticated;`), f);
    }
    assert.match(c.trim(), /select harden_definer_functions\(\);$/);
  });

  it("der Datenbank-Test liegt dabei und ist in der README verzeichnet", () => {
    const t = quelle("supabase/tests/v6_buehnen_stammdaten.sql");
    assert.match(t, /99_auswertung/);
    assert.match(t, /set local role authenticated/);
    assert.match(quelle("supabase/tests/README.md"), /\| `v6_buehnen_stammdaten\.sql` \|/);
  });
});

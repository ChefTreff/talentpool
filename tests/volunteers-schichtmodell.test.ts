import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { toRpcFailure } from "@/lib/rpc-error";
import { bereichFuer, isoWochentag, leseCsv, positionOhneNummer, teileBlock, vorlagenAus } from "@/lib/volunteers/planstellen.mjs";
import { breakConflicts, lengthKind, shiftHours, shortBreakShiftIds, templateHours } from "@/lib/volunteers/schichten";
import { migrationText } from "@/tests/migration-datei";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("Schichtmodell: Regeln (VOL-002, K-44)", () => {
  it("Blöcke 4–6 h, Warnung erst ab 8 h", () => {
    assert.equal(lengthKind(3), "short");
    assert.equal(lengthKind(4), "block");
    assert.equal(lengthKind(6), "block");
    assert.equal(lengthKind(7), "ok");
    assert.equal(lengthKind(8), "long");
    assert.equal(lengthKind(12), "long");
  });

  it("Dauer einer Schicht und einer Vorlage (Ende vor Beginn = Folgetag)", () => {
    assert.equal(shiftHours({ start_at: "2027-04-16T08:00:00Z", end_at: "2027-04-16T14:30:00Z" }), 6.5);
    assert.equal(templateHours("09:00", "13:00"), 4);
    assert.equal(templateHours("22:00", "02:00"), 4);
  });

  it("zwei Schichten ohne Stunde Pause werden gemeldet, mit Pause nicht", () => {
    const a = { id: "a", start_at: "2027-04-16T08:00:00Z", end_at: "2027-04-16T12:00:00Z" };
    const b = { id: "b", start_at: "2027-04-16T12:30:00Z", end_at: "2027-04-16T16:00:00Z" };
    const c = { id: "c", start_at: "2027-04-16T17:00:00Z", end_at: "2027-04-16T20:00:00Z" };
    assert.deepEqual(breakConflicts([b, a, c]), [["a", "b"]]);
    const plan = [
      { ...a, people: [{ person_id: "p1", status: "confirmed" }] },
      { ...b, people: [{ person_id: "p1", status: "assigned" }, { person_id: "p2", status: "declined" }] },
      { ...c, people: [{ person_id: "p1", status: "assigned" }] },
    ];
    const kurz = shortBreakShiftIds(plan);
    assert.deepEqual([...kurz.keys()].sort(), ["a", "b"]);
    assert.ok(!kurz.has("c"));
  });
});

describe("Planstellen 2026 → Vorlagen", () => {
  it("Bereich aus dem Namenspräfix, Unbekanntes landet sichtbar im Fallback", () => {
    assert.equal(bereichFuer("Akkreditierung, PreScan 1 (Check-in Hero)").bereich, "accreditation");
    assert.equal(bereichFuer("Check-In Hero 4").bereich, "accreditation");
    assert.equal(bereichFuer("Zutrittskontrolle, Gate 4").bereich, "access_control");
    assert.equal(bereichFuer("Speakerscare 1.9").bereich, "speakers_care");
    assert.equal(bereichFuer("Speakers Lounge 2").bereich, "speaker_lounge");
    assert.deepEqual(bereichFuer("VC Breakfast 1"), { bereich: "event_operations", sicher: false });
  });

  it("laufende Nummern fallen weg, Nummern in der Mitte bleiben", () => {
    assert.equal(positionOhneNummer("Construction Hero 3"), "Construction Hero");
    assert.equal(positionOhneNummer("Akkreditierung, PreScan 1 (Check-in Hero)"), "Akkreditierung, PreScan 1 (Check-in Hero)");
  });

  it("lange Blöcke werden in 4–6-Stunden-Teile geteilt, kurze bleiben ganz", () => {
    assert.deepEqual(teileBlock("09:00", "13:00"), [["09:00", "13:00"]]);
    assert.deepEqual(teileBlock("10:00", "17:00"), [["10:00", "17:00"]]);
    assert.deepEqual(teileBlock("08:00", "16:00"), [["08:00", "12:00"], ["12:00", "16:00"]]);
    const teile = teileBlock("08:00", "24:00");
    assert.equal(teile.length, 3);
    assert.equal(teile[0][0], "08:00");
    assert.equal(teile[2][1], "00:00");
    for (const [a, b] of teile) {
      const h = templateHours(a, b);
      assert.ok(h >= 4 && h <= 6, `${a}-${b}`);
    }
  });

  it("Wochentag und Zusammenfassen gleicher Positionen zu einem Block mit Plätzen", () => {
    assert.equal(isoWochentag("2026-04-10"), 5); // Freitag
    const zeilen = leseCsv(
      [
        "Bereich;Position;Datum;Beginn;Ende;Plaetze;Briefing",
        ";Construction Hero 1;2026-04-08;10:00;14:00;1;",
        ";Construction Hero 2;2026-04-08;10:00;14:00;1;https://example.org/b",
        ";Construction Hero 3;2026-04-09;10:00;14:00;1;",
      ].join("\n"),
    );
    const { vorlagen, unsicher } = vorlagenAus(zeilen);
    assert.deepEqual(unsicher, []);
    assert.equal(vorlagen.length, 2);
    const mi = vorlagen.find((v: { weekday: number }) => v.weekday === 3);
    assert.equal(mi?.capacity, 2);
    assert.equal(mi?.briefing_md, "https://example.org/b");
    assert.equal(mi?.area, "construction");
  });

  it("die abgelegte Datei ergibt nur Blöcke bis 7 Stunden und keine Personen", () => {
    const text = read("docs/import/volunteer-planstellen-2026.csv");
    const { vorlagen } = vorlagenAus(leseCsv(text));
    assert.ok(vorlagen.length > 100);
    for (const v of vorlagen) assert.ok(templateHours(v.start_time, v.end_time) <= 7, `${v.position} ${v.start_time}-${v.end_time}`);
    assert.doesNotMatch(text.split("\n")[0], /person|name|mail/i);
  });
});

describe("Schichtmodell: Migration", () => {
  const sql = migrationText("v6_volunteers_schichtmodell");

  it("Tabellen mit RLS und ohne Grants, Funktionen gehärtet", () => {
    for (const t of ["shift_template", "shift_wish"]) {
      assert.match(sql, new RegExp(`alter table ${t} enable row level security`));
      assert.match(sql, new RegExp(`revoke all on ${t} from anon, authenticated`));
    }
    assert.match(sql.trimEnd(), /select harden_definer_functions\(\);$/);
  });

  it("Anwenden ist idempotent über (template_id, event_day_id) und schreibt Audit mit Anzahl", () => {
    assert.match(sql, /create unique index if not exists shift_template_day_uidx on shift \(template_id, event_day_id\) where template_id is not null/);
    assert.match(sql, /on conflict \(template_id, event_day_id\) where template_id is not null do nothing/);
    assert.match(sql, /'volunteer\.apply_shift_templates'[\s\S]*'created', v_n/);
  });

  it("Sicherheitsunterweisung: Version gespeichert, Audit nur mit Version, confirm_shift verweigert", () => {
    const ack = sql.slice(sql.indexOf("create or replace function ack_volunteer_safety"), sql.indexOf("create or replace function my_volunteer_safety"));
    assert.match(ack, /safety_ack_version = v_ver/);
    assert.match(ack, /jsonb_build_object\('version', v_ver\)/);
    assert.doesNotMatch(ack, /email/i);
    const confirm = sql.slice(sql.indexOf("create or replace function confirm_shift"));
    assert.match(confirm, /raise exception 'safety_ack_required'/);
  });

  it("Wunschschichten zeigen keine Namen und keine Belegung anderer", () => {
    const wishable = sql.slice(sql.indexOf("create or replace function wishable_shifts"), sql.indexOf("create or replace function set_my_shift_wishes"));
    assert.doesNotMatch(wishable, /first_name|last_name|shift_taken|shift_assignment|capacity/);
    assert.match(wishable, /where s\.edition_id = v_ed and s\.active/);
  });

  it("Team-Funktionen verlangen is_volunteer_team", () => {
    for (const fn of ["shift_templates", "upsert_shift_template", "delete_shift_template", "apply_shift_templates", "shift_wishes", "volunteers_without_wish", "volunteers_without_safety_ack"]) {
      const start = sql.indexOf(`create or replace function ${fn}(`);
      assert.ok(start > 0, fn);
      assert.match(sql.slice(start, start + 900), /if not is_volunteer_team\(\)/, fn);
    }
  });

  it("neue Fehlerschlüssel haben Texte in beiden Sprachen", () => {
    for (const key of ["safety_ack_required", "wish_required", "too_many_wishes"]) {
      assert.equal(toRpcFailure({ code: "P0001", message: key, details: "", hint: "", name: "PostgrestError" } as never).key, key);
    }
    for (const key of ["safety_ack_required", "wish_required", "too_many_wishes", "template_not_found", "invalid_times"]) {
      for (const lang of ["de", "en"]) assert.ok(JSON.parse(read(`lib/i18n/${lang}.json`)).rpc[key], `${lang}:${key}`);
    }
  });
});

describe("Schichtmodell: Oberfläche", () => {
  it("Vorlagen sind unter /admin/volunteers erreichbar (Admin-Weg)", () => {
    assert.match(read("app/(admin)/admin/volunteers/shell.tsx"), /\/admin\/volunteers\/vorlagen/);
    assert.match(read("app/(admin)/admin/volunteers/vorlagen/page.tsx"), /shift_templates/);
  });

  it("Bestätigen ist ohne Unterweisung gesperrt, die Hinweise sind nur Hinweise", () => {
    assert.match(read("app/(volunteers)/volunteers/schichten/ShiftList.tsx"), /disabled=\{pending \|\| !safetyAcked\}/);
    const plan = read("app/(admin)/admin/volunteers/ShiftPlan.tsx");
    assert.match(plan, /WARN_FROM_HOURS/);
    assert.doesNotMatch(plan, /raise|throw new Error\(.*Stunden/);
  });

  it("beide Sprachen führen dieselben neuen Schlüssel", () => {
    const de = JSON.parse(read("lib/i18n/de.json"));
    const en = JSON.parse(read("lib/i18n/en.json"));
    for (const block of ["adminVolunteers", "volunteers"]) {
      assert.deepEqual(Object.keys(de[block]).sort(), Object.keys(en[block]).sort(), block);
    }
  });
});

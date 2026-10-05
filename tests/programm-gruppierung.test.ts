import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { compile } from "tailwindcss";
import { gruppiereSlots, NOCH_OFFEN } from "@/components/programme/gruppen";
import { SLOT_ABSTAND, halbeStunden, slotBox } from "@/components/programme/geometry";
import type { BoardDay, BoardSlot, BoardStage } from "@/components/programme/types";

/**
 * ADM-069 (Konrad und Paulina, 05.10.): „klarere Linien pro Slot und direkt eine Gruppierung pro Bühne, sodass man
 * jeweils pro Bühne pro Tag die Slots sieht“ — in der Tabelle und im Kalender (auch im Board der Stage Leads, es ist
 * dieselbe Komponente). Hier steht, was an der Gruppierung und an den Linien feststeht.
 */

const lies = (pfad: string) => readFileSync(pfad, "utf8");
const TABELLE = lies("components/programme/ProgrammeTable.tsx");
const BOARD = lies("components/programme/Board.tsx");
const TYPEN = lies("components/programme/types.ts");

const stage = (id: string, sort_order: number, name = id): BoardStage => ({
  id,
  name,
  slug: id,
  type: "main",
  room: null,
  sort_order,
  changeover_min: 5,
  default_duration_min: 30,
});
const tag = (id: string, day_date: string): BoardDay => ({
  id,
  day_date,
  label_de: null,
  label_en: null,
  programme_start: null,
  programme_end: null,
});
let nr = 0;
const slot = (stageId: string, dayId: string, von: string, bis: string, status = "open", stageName = stageId): BoardSlot => {
  nr += 1;
  return {
    slot_id: `s${nr}`,
    stage_id: stageId,
    stage_name: stageName,
    event_day_id: dayId,
    day_date: dayId === "d1" ? "2027-04-16" : "2027-04-17",
    event_id: "e",
    start_at: `2027-04-16T${von}:00Z`,
    end_at: `2027-04-16T${bis}:00Z`,
    slot_type: "session",
    slot_status: status,
    session_id: null,
    title_de: null,
    title_en: null,
    format: null,
    language: null,
    access_mode: null,
    publish_status: null,
    capacity: null,
    speakers: null,
    can_edit: true,
  };
};

describe("Gruppen nach Bühne und Tag (ADM-069)", () => {
  const buehnen = [stage("main", 1, "Main Stage"), stage("tech", 2, "Tech Stage")];
  const tage = [tag("d1", "2027-04-16"), tag("d2", "2027-04-17")];

  it("eine Gruppe je Bühne und Tag, die Bühnen in ihrer Reihenfolge, darin die Tage", () => {
    // Absichtlich durcheinander, wie die Sortierung der Tabelle sie liefern kann (nach Zeit).
    const zeilen = [
      slot("tech", "d1", "08:30", "09:00"),
      slot("main", "d2", "08:00", "08:30"),
      slot("main", "d1", "09:00", "09:30"),
      slot("tech", "d2", "09:00", "09:30"),
      slot("main", "d1", "10:00", "10:30"),
    ];
    const gruppen = gruppiereSlots(zeilen, buehnen, tage);
    assert.deepEqual(
      gruppen.map((g) => g.key),
      ["main|d1", "main|d2", "tech|d1", "tech|d2"],
    );
    assert.deepEqual(gruppen.map((g) => g.rows.length), [2, 1, 1, 1]);
  });

  it("die Zeilen einer Gruppe behalten die Reihenfolge, in der sie hereinkommen (die Spaltensortierung gilt darin)", () => {
    const a = slot("main", "d1", "10:00", "10:30");
    const b = slot("main", "d1", "09:00", "09:30");
    const c = slot("main", "d1", "11:00", "11:30");
    const [g] = gruppiereSlots([a, b, c], buehnen, tage);
    assert.deepEqual(g.rows.map((r) => r.slot_id), [a.slot_id, b.slot_id, c.slot_id]);
  });

  it("zählt, was noch Arbeit macht: offen, angefragt, bestätigt ohne Titel — nicht final, nicht „nicht genutzt“", () => {
    assert.deepEqual([...NOCH_OFFEN], ["open", "requested", "confirmed_title_open"]);
    const zeilen = ["open", "requested", "confirmed_title_open", "final", "unused", "final"].map((s, i) =>
      slot("main", "d1", `0${i + 1}:00`, `0${i + 1}:30`, s),
    );
    const [g] = gruppiereSlots(zeilen, buehnen, tage);
    assert.equal(g.rows.length, 6);
    assert.equal(g.offen, 3);
  });

  it("nennt den frühesten Beginn und das späteste Ende der Gruppe", () => {
    const [g] = gruppiereSlots(
      [slot("main", "d1", "11:00", "12:00"), slot("main", "d1", "09:30", "10:00"), slot("main", "d1", "10:00", "13:15")],
      buehnen,
      tage,
    );
    assert.equal(g.von, "2027-04-16T09:30:00Z");
    assert.equal(g.bis, "2027-04-16T13:15:00Z");
  });

  it("eine Bühne, die die Liste nicht kennt, steht zuletzt statt zu fehlen", () => {
    const gruppen = gruppiereSlots([slot("fremd", "d1", "09:00", "09:30"), slot("tech", "d1", "09:00", "09:30")], buehnen, tage);
    assert.deepEqual(gruppen.map((g) => g.stageId), ["tech", "fremd"]);
  });

  it("keine Zeilen, keine Gruppen", () => {
    assert.deepEqual(gruppiereSlots([], buehnen, tage), []);
  });
});

describe("Die Tabelle (ADM-069)", () => {
  it("gruppiert ist der Normalfall, `?gruppe=aus` hebt es auf", () => {
    assert.match(TABELLE, /sort: "time", gruppe: "" \}/);
    assert.match(TABELLE, /const gruppiert = filter\.gruppe !== "aus";/);
    assert.match(TABELLE, /setFilter\(\{ gruppe: e\.target\.checked \? "" : "aus" \}\)/);
  });

  it("in einer Gruppe fallen die Spalten Bühne und Tag weg (die Gruppe sagt beides), und die Sortierung danach gilt nicht mehr", () => {
    assert.match(TABELLE, /\{!gruppiert && head\("stage", t\.colStage\)\}/);
    assert.match(TABELLE, /\{!gruppiert && head\("day", t\.colDay\)\}/);
    assert.match(TABELLE, /\{!gruppiert && <Td className="text-muted">\{row\.stage_name\}<\/Td>\}/);
    assert.match(TABELLE, /gruppiert && \(gewaehlt === "stage" \|\| gewaehlt === "day"\) \? "time" : gewaehlt/);
  });

  it("jede Gruppe ist ein eigener `<tbody>` mit einer Kopfzeile über alle Spalten (`scope=\"rowgroup\"`)", () => {
    assert.match(TABELLE, /gruppen\.map\(\(g\) => \(\s*<Tbody key=\{g\.key\}>/);
    assert.match(TABELLE, /<th\s+scope="rowgroup"\s+colSpan=\{spalten\}/);
    // Die Zahl der Spalten stimmt mit den Zellen der Zeile überein: 6 feste, die Verantwortung, ungruppiert Bühne und Tag.
    assert.match(TABELLE, /const spalten = 6 \+ \(verantwortliche \? 1 : 0\) \+ \(gruppiert \? 0 : 2\);/);
  });

  it("der Kopf der Gruppe ist eine Überschrift (`h2`, Versalien wie die Abschnitte), nennt die Zahl der Slots und was noch offen ist", () => {
    assert.match(TABELLE, /<h2 className="ct-h2 text-ink">/);
    assert.match(TABELLE, /t\.groupSlotOne : t\.groupSlotMany/);
    assert.match(TABELLE, /gruppe\.offen > 0 && ` · \$\{t\.groupOpen\.replace/);
  });

  it("der Kopf der Gruppe klebt links, wenn die breite Tabelle seitlich scrollt", () => {
    assert.match(TABELLE, /sticky left-0 flex w-fit max-w-72 flex-wrap items-baseline gap-x-6 gap-y-1 sm:max-w-full/);
  });

  it("eine Zeile je Slot: die Uhrzeit bricht nicht um, ein Name nie in sich, die Linie zwischen zwei Slots ist deutlich", () => {
    assert.match(TABELLE, /<Td className="whitespace-nowrap tabular-nums text-muted">/);
    assert.match(TABELLE, /className="whitespace-nowrap">\s*\{speakerName\(s\)\}/);
    assert.match(TABELLE, /<Td className="min-w-72">/);
    assert.match(TABELLE, /<Tr dicht className="border-border-strong\/60 \[&>td\]:py-1">/);
  });

  it("die Texte stehen in DE und EN, und beide Sprachen kennen dieselben Schlüssel", () => {
    const de = JSON.parse(lies("lib/i18n/de.json")).admin.programmeTable;
    const en = JSON.parse(lies("lib/i18n/en.json")).admin.programmeTable;
    for (const k of ["groupBy", "groupSlotOne", "groupSlotMany", "groupOpen"]) {
      assert.ok(de[k], `de ${k}`);
      assert.ok(en[k], `en ${k}`);
    }
    assert.match(de.groupSlotMany, /\{n\}/);
    assert.match(de.groupOpen, /\{n\}/);
    assert.match(en.groupOpen, /\{n\}/);
  });

  it("Tailwind macht aus den neuen Klassen eine Regel (ein Tippfehler im Namen fiele sonst stillschweigend weg)", async () => {
    const theme = /@theme inline \{[\s\S]*?\n\}/.exec(lies("app/globals.css"))?.[0] ?? "";
    assert.ok(theme.length > 0, "Theme-Block gefunden");
    const tw = await compile(`@theme { --spacing: 0.25rem; --breakpoint-sm: 40rem; }\n${theme}\n@tailwind utilities;`);
    const klassen = [
      "border-border-strong/60",
      "border-border-strong/40",
      "[&>td]:py-1",
      "min-w-72",
      "whitespace-nowrap",
      "sticky",
      "left-0",
      "w-fit",
      "max-w-72",
      "sm:max-w-full",
      "bg-accent-soft",
      "border-dashed",
      "ring-1",
      "ring-inset",
      "ring-accent/30",
    ];
    const css = tw.build(klassen);
    const fehlend = klassen.filter((k) => !css.includes(k.replace(/([:\[\]&>()*,.%/])/g, "\\$1")));
    assert.deepEqual(fehlend, []);
  });
});

describe("Der Kalender (ADM-069)", () => {
  it("zwischen zwei Karten liegen 4 px, unter der Karte: der Beginn steht genau auf der Rasterlinie", () => {
    assert.equal(SLOT_ABSTAND, 4);
    // 60 Minuten à 1,6 px = 96 px, davon 4 px Abstand; die Karte beginnt auf der Linie.
    assert.deepEqual(slotBox(540, 600, 480), { top: 96, height: 92 });
    // Zwei aufeinanderfolgende Karten lassen den Abstand sichtbar frei.
    const erste = slotBox(600, 630, 600);
    const zweite = slotBox(630, 660, 600);
    assert.equal(zweite.top - (erste.top + erste.height), SLOT_ABSTAND);
  });

  it("die halben Stunden liegen zwischen den vollen und nie auf der Oberkante des Fensters", () => {
    assert.deepEqual(halbeStunden(600, 720), [630, 690]);
    assert.deepEqual(halbeStunden(570, 720), [630, 690]);
    assert.deepEqual(halbeStunden(600, 690), [630]);
    assert.deepEqual(halbeStunden(600, 630), []);
  });

  it("die Stundenlinie in voller Farbe, die halbe Stunde gestrichelt dazwischen", () => {
    assert.match(BOARD, /border-t border-border-strong\/40"\s+style=\{\{ top: \(m - windowStart\) \* PX_PER_MIN \}\}/);
    assert.match(BOARD, /border-t border-dashed border-border"\s+style=\{\{ top: \(m - windowStart\) \* PX_PER_MIN \}\}/);
    assert.match(BOARD, /halfMarks=\{halfMarks\}/);
    // Die schwache Fassung („60 %“) ist weg.
    assert.doesNotMatch(BOARD, /border-border\/60/);
  });

  it("die helle Karte „Bestätigt, Titel offen“ trägt einen Rand rundherum, die Leiste links bleibt", () => {
    assert.match(TYPEN, /confirmed_title_open: \{ flaeche: "border-l-4 border-accent bg-accent-soft ring-1 ring-inset ring-accent\/30"/);
  });
});

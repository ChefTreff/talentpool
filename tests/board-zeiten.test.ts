import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * Board: Zeiten und Ziehen (LEAD-018/050/051/052, Konrad 24./25.09.) — freie
 * Start- und Endzeit im Schubfach, Rückfrage „Wirklich verschieben?“, Vorschau
 * beim Ziehen und Länge an der Unterkante. Keine neue Datenbank-Funktion: alle
 * Wege gehen über `move_slot` mit seinen Rechten (`can_edit_stage`).
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const board = () => quelle("components/programme/Board.tsx");
const drawer = () => quelle("components/programme/SessionDrawer.tsx");
const woerterbuch = (sprache: "de" | "en") =>
  JSON.parse(readFileSync(new URL(`../lib/i18n/${sprache}.json`, import.meta.url), "utf8"));

describe("LEAD-050: Rückfrage beim Ziehen", () => {
  it("Loslassen einer Karte fragt nach, statt sofort zu verschieben", () => {
    const b = board();
    const ende = b.slice(b.indexOf("function onDragEnd("), b.indexOf("/** Ziehen am unteren Rand ändert die Dauer. */"));
    assert.match(ende, /setRueckfrage\(\{/);
    // Die Karte selbst geht nicht mehr direkt an `runMove` — nur die neue Karte aus dem Backlog wird angelegt.
    assert.doesNotMatch(ende, /runMove\(/);
  });

  it("bei einer veröffentlichten Session in einem Dialog, mit der Bestätigung für move_slot", () => {
    const b = board();
    assert.match(b, /veroeffentlicht: slot\.publish_status === "published"/);
    assert.match(b, /runMove\(\{ \.\.\.input, confirm: veroeffentlicht \}\)/);
    assert.match(b, /t\.dragConfirmBody\.replace\("\{von\}", rueckfrage\.von\)\.replace\("\{nach\}", rueckfrage\.nach\)/);
  });
});

describe("LEAD-051: Vorschau beim Ziehen", () => {
  it("die Zielspalte zeigt gestrichelt die Zielzeit; Abbruch räumt sie weg", () => {
    const b = board();
    assert.match(b, /onDragMove=\{onDragMove\}/);
    assert.match(b, /onDragCancel=\{\(\) => \{\s+setDragging\(null\);\s+setVorschau\(null\);/);
    assert.match(b, /vorschau=\{vorschau\?\.stageId === stage\.id \? vorschau : null\}/);
    assert.match(b, /border-dashed border-accent/);
  });
});

describe("LEAD-052: Länge an der Unterkante", () => {
  it("die Karte folgt beim Ziehen und zeigt das neue Ende; gespeichert wird beim Loslassen", () => {
    const b = board();
    assert.match(b, /setVorschauEnde\(resizedEnd\(startMin, serverEnde, ev\.clientY - startY\)\)/);
    assert.match(b, /const endMin = vorschauEnde \?\? serverEnde;/);
    assert.match(b, /setVorschauEnde\(null\);\s+onResize\(ev\.clientY - startY\);/);
  });

  it("der Griff ist größer und beim Überfahren sichtbar", () => {
    const b = board();
    assert.match(b, /flex h-3 cursor-ns-resize/);
    assert.match(b, /group-hover:opacity-100/);
  });
});

describe("LEAD-018: freie Zeiten und Öffnungszeiten", () => {
  it("das Schubfach bietet Beginn und Ende im 5-Minuten-Raster an, das Ende nach dem Beginn", () => {
    const d = drawer();
    assert.match(d, /function ZeitFelder\(/);
    assert.match(d, /type="time" step=\{300\}/);
    assert.match(d, /const ungueltig = a === null \|\| b === null \|\| b <= a;/);
    assert.match(d, /onChangeTime && slotInfo\.startMin !== undefined && slotInfo\.endMin !== undefined/);
  });

  it("das Board reicht die Zeit nur für bearbeitbare Slots herein", () => {
    const b = board();
    assert.match(b, /zeitSlot \? zeitSlot\.can_edit && bearbeitbar\(zeitSlot\.stage_id\) : !!editing\.neu && bearbeitbar\(editing\.neu\.stageId\)/);
    assert.match(b, /onChangeTime=\{\s+zeitAenderbar\s+\?/);
  });

  it("das Admin-Board verlinkt die Öffnungszeiten im Gerüst, wo der Abschnitt offen ist", () => {
    const seite = quelle("app/(admin)/admin/programm/page.tsx");
    assert.match(seite, /mayEnterAdminSection\("edition", roleNames\)/);
    assert.match(seite, /href="\/admin\/edition#zeiten"/);
    assert.match(quelle("app/(admin)/admin/edition/GeruestView.tsx"), /<Card id="zeiten">/);
  });

  it("die Texte stehen in DE und EN", () => {
    for (const sprache of ["de", "en"] as const) {
      const p = woerterbuch(sprache).admin.programme;
      for (const k of ["dragConfirmTitle", "dragConfirmBody", "dragConfirmAction", "dragConfirmPublished", "timeStart", "timeEnd", "timeApply", "timeInvalid", "editionLink"]) {
        assert.ok(p[k], `${sprache}.admin.programme.${k} fehlt`);
      }
      assert.ok(p.dragConfirmBody.includes("{von}") && p.dragConfirmBody.includes("{nach}"));
    }
  });
});

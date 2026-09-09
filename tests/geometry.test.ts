import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  dayWindow,
  hourMarks,
  minutesFromOffset,
  resizedEnd,
  slotBox,
  GRID_MIN,
  PX_PER_MIN,
} from "@/app/(admin)/admin/programm/geometry";

describe("Zeitfenster des Boards", () => {
  it("nimmt die Programmzeiten des Tages, wenn sie stehen", () => {
    assert.deepEqual(dayWindow([{ startMin: 600, endMin: 630 }], 540, 1080), {
      start: 540,
      end: 1080,
    });
  });

  it("spannt sonst die Slots mit einer Stunde Luft ein", () => {
    // 10:00–11:30 -> volle Stunden 09:00–12:30
    assert.deepEqual(dayWindow([{ startMin: 600, endMin: 690 }], null, null), {
      start: 540,
      end: 780,
    });
  });

  it("fällt ohne alles auf 08–20 Uhr zurück", () => {
    assert.deepEqual(dayWindow([], null, null), { start: 480, end: 1200 });
  });

  it("ignoriert Programmzeiten, deren Ende vor dem Anfang liegt", () => {
    assert.deepEqual(dayWindow([], 1080, 540), { start: 480, end: 1200 });
  });

  it("bleibt innerhalb eines Tages", () => {
    assert.deepEqual(dayWindow([{ startMin: 10, endMin: 30 }], null, null), {
      start: 0,
      end: 120,
    });
    assert.deepEqual(dayWindow([{ startMin: 1400, endMin: 1430 }], null, null), {
      start: 1320,
      end: 1440,
    });
  });

  it("zeigt mindestens zwei Stunden", () => {
    const w = dayWindow([{ startMin: 600, endMin: 610 }], null, null);
    assert.ok(w.end - w.start >= 120, `Fenster nur ${w.end - w.start} min`);
  });
});

describe("Karten im Raster", () => {
  it("setzt Position und Höhe aus der Uhrzeit", () => {
    assert.deepEqual(slotBox(540, 600, 480), { top: 60 * PX_PER_MIN, height: 94 });
    assert.deepEqual(slotBox(480, 510, 480), { top: 0, height: 46 });
  });

  it("hält kurze Slots anklickbar", () => {
    assert.equal(slotBox(540, 545, 480).height, 22);
  });
});

describe("Ablegen und Größe ändern", () => {
  it("rechnet die Y-Position in eine Startminute um", () => {
    assert.equal(minutesFromOffset(0, 480, 1200), 480);
    assert.equal(minutesFromOffset(60 * PX_PER_MIN, 480, 1200), 540);
  });

  it("rundet auf das Fünf-Minuten-Raster", () => {
    assert.equal(minutesFromOffset(98, 480, 1200), 540); // 541,25
    assert.equal(minutesFromOffset(100, 480, 1200), 545); // 542,5 -> auf
    for (let px = 0; px < 400; px++) {
      assert.equal(minutesFromOffset(px, 480, 1200) % GRID_MIN, 0, `px ${px}`);
    }
  });

  it("klemmt an beiden Rändern des Fensters", () => {
    assert.equal(minutesFromOffset(-500, 480, 1200), 480);
    assert.equal(minutesFromOffset(99_999, 480, 1200), 1200 - GRID_MIN);
  });

  it("ändert das Ende beim Ziehen am unteren Rand", () => {
    assert.equal(resizedEnd(540, 600, 30 * PX_PER_MIN), 630);
    assert.equal(resizedEnd(540, 600, -30 * PX_PER_MIN), 570);
    assert.equal(resizedEnd(540, 600, 7), 605); // rastert
  });

  it("lässt einen Slot nie unter einen Rasterschritt schrumpfen", () => {
    assert.equal(resizedEnd(540, 600, -9999), 540 + GRID_MIN);
  });
});

describe("Stundenlinien", () => {
  it("markiert die vollen Stunden im Fenster", () => {
    assert.deepEqual(hourMarks(480, 660), [480, 540, 600, 660]);
    assert.deepEqual(hourMarks(500, 620), [540, 600]);
  });
});

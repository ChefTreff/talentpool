import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  MAX_KANTE,
  ZOOM_MAX,
  ZOOM_MIN,
  ausgabeKante,
  ausschnitt,
  begrenze,
  deckung,
  zoomeAuf,
  zuschnittDateiname,
} from "@/lib/bildzuschnitt";

/**
 * ADM-066: Die Rechnung des Zuschnitt-Dialogs. Die Zeichenfläche selbst lässt sich im
 * Test nicht prüfen; was sie zeichnet und was sie exportiert, folgt aus diesen Zahlen.
 */

const nah = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

describe("Deckung: bei Zoom 1 ist nichts leer", () => {
  it("nimmt die längere Seite des Verhältnisses (cover)", () => {
    nah(deckung(1000, 500, 720), 720 / 500); // Querformat: die Höhe bestimmt
    nah(deckung(500, 1000, 720), 720 / 500); // Hochformat: die Breite bestimmt
    nah(deckung(600, 600, 720), 1.2);
  });
});

describe("Begrenzung: das Bild bedeckt den Ausschnitt immer", () => {
  it("lässt bei Zoom 1 und quadratischem Bild keine Verschiebung zu", () => {
    const l = begrenze({ zoom: 1, x: 300, y: -200 }, 800, 800, 720);
    assert.deepEqual(l, { zoom: 1, x: 0, y: 0 });
  });

  it("lässt bei einem Querformat nur seitlich verschieben", () => {
    const l = begrenze({ zoom: 1, x: 1000, y: 1000 }, 1600, 800, 720);
    // Höhe füllt genau (kein Spielraum), Breite: 1600 · 0,9 = 1440 → (1440 − 720) / 2 = 360
    assert.equal(l.y, 0);
    nah(l.x, 360);
  });

  it("wächst der Spielraum mit dem Zoom", () => {
    const l = begrenze({ zoom: 2, x: 5000, y: -5000 }, 800, 800, 720);
    // s = 0,9 · 2 = 1,8 → Bild 1440 px → (1440 − 720) / 2 = 360
    nah(l.x, 360);
    nah(l.y, -360);
  });

  it("hält den Zoom zwischen Mindest- und Höchstwert", () => {
    assert.equal(begrenze({ zoom: 0.2, x: 0, y: 0 }, 800, 800, 720).zoom, ZOOM_MIN);
    assert.equal(begrenze({ zoom: 99, x: 0, y: 0 }, 800, 800, 720).zoom, ZOOM_MAX);
  });
});

describe("Zoom um die Mitte", () => {
  it("lässt den Bildpunkt in der Mitte stehen", () => {
    const B = 1000, H = 1000, K = 720;
    const vorher = { zoom: 2, x: 100, y: -80 };
    const nachher = zoomeAuf(vorher, 3, B, H, K);
    const a = ausschnitt(vorher, B, H, K);
    const b = ausschnitt(nachher, B, H, K);
    // Mitte des Ausschnitts in der Quelle = linke obere Ecke + halbe Kante
    nah(a.sx + a.sw / 2, b.sx + b.sw / 2, 1e-6);
    nah(a.sy + a.sw / 2, b.sy + b.sw / 2, 1e-6);
  });

  it("macht den Ausschnitt beim Hineinzoomen kleiner", () => {
    const k = ausschnitt({ zoom: 1, x: 0, y: 0 }, 1000, 1000, 720).sw;
    const k2 = ausschnitt({ zoom: 2, x: 0, y: 0 }, 1000, 1000, 720).sw;
    nah(k2, k / 2);
  });
});

describe("Ausschnitt in der Quelle", () => {
  it("zeigt bei Zoom 1 das ganze kürzere Maß, mittig", () => {
    const a = ausschnitt({ zoom: 1, x: 0, y: 0 }, 1600, 800, 720);
    nah(a.sw, 800);
    nah(a.sx, 400); // links und rechts je 400 abgeschnitten
    nah(a.sy, 0);
  });

  it("wandert mit der Verschiebung: Bild nach rechts gezogen heißt Ausschnitt weiter links", () => {
    const mitte = ausschnitt({ zoom: 2, x: 0, y: 0 }, 1000, 1000, 720);
    const rechts = ausschnitt({ zoom: 2, x: 100, y: 0 }, 1000, 1000, 720);
    assert.ok(rechts.sx < mitte.sx);
    nah(rechts.sy, mitte.sy);
  });

  it("bleibt innerhalb des Bildes, solange die Lage begrenzt ist", () => {
    for (const [B, H] of [[1600, 800], [800, 1600], [1000, 1000]] as const) {
      for (const zoom of [1, 1.7, 4]) {
        for (const x of [-9999, 0, 9999]) {
          for (const y of [-9999, 0, 9999]) {
            const l = begrenze({ zoom, x, y }, B, H, 720);
            const a = ausschnitt(l, B, H, 720);
            assert.ok(a.sx >= -1e-6 && a.sy >= -1e-6, `${B}×${H} z${zoom}: links/oben`);
            assert.ok(a.sx + a.sw <= B + 1e-6 && a.sy + a.sw <= H + 1e-6, `${B}×${H} z${zoom}: rechts/unten`);
          }
        }
      }
    }
  });
});

describe("Größe der fertigen Datei", () => {
  it("rechnet nie hoch: ein kleiner Ausschnitt bleibt klein", () => {
    assert.equal(ausgabeKante(640.4), 640);
  });
  it("deckelt bei 2000 px", () => {
    assert.equal(ausgabeKante(5000), MAX_KANTE);
    assert.equal(MAX_KANTE, 2000);
  });
  it("liefert mindestens einen Bildpunkt", () => {
    assert.equal(ausgabeKante(0), 1);
  });
});

describe("Dateiname", () => {
  it("nimmt den alten Namen ohne Endung und setzt die neue", () => {
    assert.equal(zuschnittDateiname("IMG_0042.JPG", "image/webp"), "IMG_0042.webp");
    assert.equal(zuschnittDateiname("Porträt final.png", "image/jpeg"), "Portraet-final.jpg");
  });
  it("kommt mit Pfaden, Sonderzeichen und leerem Namen zurecht", () => {
    assert.equal(zuschnittDateiname("..\\evil/../a b.jpeg", "image/webp"), "a-b.webp");
    assert.equal(zuschnittDateiname("!!!.png", "image/webp"), "foto.webp");
    assert.equal(zuschnittDateiname("", "image/webp"), "foto.webp");
  });
  it("kürzt sehr lange Namen", () => {
    assert.ok(zuschnittDateiname("a".repeat(300) + ".jpg", "image/webp").length <= 65);
  });
});

import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { inflateSync } from "node:zlib";

/**
 * QS-071 (Konrad & Leopold 05.10.): in der Browser-Leiste stand noch das Vercel-Logo, die Vorgabe von create-next-app.
 * Jetzt trägt jede Seite das ChefTreff-Logo als Icon: `app/icon.svg`, `app/favicon.ico` und `app/apple-icon.png` legt
 * Next selbst als <link> an (Dateikonvention). Erzeugt werden sie von `scripts/icons-erzeugen.mjs` aus der Bildmarke,
 * der Originalfarbe der Marke und dem Token der Zeichenfarbe; hier steht, was an den Dateien feststehen muss — vor
 * allem, dass sie echte Bilder sind. Seit K-73 Q7 (Konrad, 08.10.) steht die Marke auf Violett statt auf Navy.
 */

const lies = (pfad: string) => readFileSync(pfad, "utf8");
const css = lies("app/globals.css");
const token = (name: string) => new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\b`).exec(css)?.[1].toLowerCase() ?? "";
/** Die Farbe der Originalmarke: alle Pfade der Originaldatei tragen dieselbe (das Skript bricht sonst ab). */
const FARBEN_ORIGINAL = [
  ...new Set(
    [...lies("public/brand/original/cheftreff-logo-original.svg").matchAll(/<path\b[^>]*\bfill="(#[0-9a-fA-F]{6})"/g)].map((t) =>
      t[1].toLowerCase(),
    ),
  ),
];
const GRUND = FARBEN_ORIGINAL.length === 1 ? FARBEN_ORIGINAL[0] : "";
const ZEICHEN = token("ct-on-navy");

/** WCAG 2.1: Kontrastverhältnis zweier Hex-Farben. */
const leuchtdichte = (farbe: string) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(farbe.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const kontrast = (a: string, b: string) => {
  const [hell, dunkel] = [leuchtdichte(a), leuchtdichte(b)].sort((m, n) => n - m);
  return (hell + 0.05) / (dunkel + 0.05);
};

/** Liest ein PNG (8 Bit RGBA, Filter 0 je Zeile, wie das Skript es schreibt) zu Pixeln. */
function dekodiere(png: Buffer) {
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], "PNG-Kennung");
  let versatz = 8;
  let breite = 0;
  let hoehe = 0;
  const idat: Buffer[] = [];
  while (versatz < png.length) {
    const laenge = png.readUInt32BE(versatz);
    const art = png.toString("ascii", versatz + 4, versatz + 8);
    const daten = png.subarray(versatz + 8, versatz + 8 + laenge);
    if (art === "IHDR") {
      breite = daten.readUInt32BE(0);
      hoehe = daten.readUInt32BE(4);
      assert.equal(daten[8], 8, "8 Bit je Kanal");
      assert.equal(daten[9], 6, "RGBA");
    }
    if (art === "IDAT") idat.push(daten);
    versatz += 12 + laenge;
  }
  const roh = inflateSync(Buffer.concat(idat));
  const zeile = breite * 4 + 1;
  const pixel = Buffer.alloc(breite * hoehe * 4);
  for (let y = 0; y < hoehe; y++) {
    assert.equal(roh[y * zeile], 0, "Filtertyp 0");
    roh.copy(pixel, y * breite * 4, y * zeile + 1, (y + 1) * zeile);
  }
  return {
    breite,
    hoehe,
    /** [r, g, b, a] an der Stelle. */
    an: (x: number, y: number) => [...pixel.subarray((y * breite + x) * 4, (y * breite + x) * 4 + 4)],
  };
}

const hex = (farbe: number[]) => `#${farbe.slice(0, 3).map((v) => v.toString(16).padStart(2, "0")).join("")}`;

describe("Farben: Violett aus der Originaldatei der Marke, Off-White aus dem Token (K-73 Q7)", () => {
  it("alle drei Pfade der Originaldatei tragen dieselbe Farbe: Violett #5454c5", () => {
    assert.equal(FARBEN_ORIGINAL.length, 1);
    assert.equal(GRUND, "#5454c5");
  });

  it("die Marke trägt auf dem Grund: mindestens 3 : 1 (WCAG 1.4.11, Grafik), gemessen 5,5 : 1", () => {
    assert.match(ZEICHEN, /^#[0-9a-f]{6}$/);
    assert.ok(kontrast(ZEICHEN, GRUND) >= 3, `Kontrast ${kontrast(ZEICHEN, GRUND).toFixed(2)} : 1`);
  });
});

describe("Das Vercel-Logo ist weg (QS-071)", () => {
  it("`app/favicon.ico` ist nicht mehr die Vorgabe von create-next-app", () => {
    const hash = createHash("sha256").update(readFileSync("app/favicon.ico")).digest("hex");
    assert.notEqual(hash, "2b8ad2d33455a8f736fc3a8ebf8f0bdea8848ad4c0db48a2833bd0f9cd775932");
  });

  it("nichts in der Wurzel überschreibt die Dateikonvention (kein `icons:` in den Metadaten)", () => {
    assert.doesNotMatch(lies("app/layout.tsx"), /\bicons\s*:/);
  });
});

describe("favicon.ico: 16, 32 und 48 px, echte Bilder", () => {
  const ico = readFileSync("app/favicon.ico");

  it("Kopf: Symbol-Datei mit drei Bildern", () => {
    assert.equal(ico.readUInt16LE(0), 0, "reserviert");
    assert.equal(ico.readUInt16LE(2), 1, "Typ Symbol");
    assert.equal(ico.readUInt16LE(4), 3);
  });

  for (const [nr, groesse] of [[0, 16], [1, 32], [2, 48]] as const) {
    it(`Bild ${groesse} px: Verzeichnis und PNG stimmen überein, Mitte ist die Marke, Rand ist der Grund oder abgerundet`, () => {
      const eintrag = 6 + nr * 16;
      assert.equal(ico[eintrag], groesse);
      assert.equal(ico[eintrag + 1], groesse);
      const laenge = ico.readUInt32LE(eintrag + 8);
      const versatz = ico.readUInt32LE(eintrag + 12);
      const bild = dekodiere(ico.subarray(versatz, versatz + laenge));
      assert.equal(bild.breite, groesse);
      assert.equal(bild.hoehe, groesse);
      // Die Mitte liegt im mittleren Sechseck der Marke.
      assert.equal(hex(bild.an(groesse / 2, groesse / 2)), ZEICHEN);
      assert.equal(bild.an(groesse / 2, groesse / 2)[3], 255);
      // Die Ecke ist abgerundet, also (fast) durchsichtig; die Mitte der obersten Reihe liegt im Quadrat und ist der Grund.
      assert.ok(bild.an(0, 0)[3] < 40, "Ecke durchsichtig");
      assert.equal(hex(bild.an(groesse / 2, 1)), GRUND);
    });
  }
});

describe("apple-icon.png: 180 px, deckend bis an den Rand", () => {
  const bild = dekodiere(readFileSync("app/apple-icon.png"));

  it("180 × 180", () => {
    assert.equal(bild.breite, 180);
    assert.equal(bild.hoehe, 180);
  });

  it("alle vier Ecken sind der Grund und undurchsichtig (iOS rundet selbst ab, Durchsichtiges würde schwarz)", () => {
    for (const [x, y] of [[0, 0], [179, 0], [0, 179], [179, 179]]) {
      assert.equal(hex(bild.an(x, y)), GRUND);
      assert.equal(bild.an(x, y)[3], 255);
    }
  });

  it("die Mitte ist die Marke in der Zeichenfarbe auf dem Grund", () => {
    assert.equal(hex(bild.an(90, 90)), ZEICHEN);
  });
});

describe("icon.svg: die echte Bildmarke in den Farben der Marke", () => {
  const svg = lies("app/icon.svg");
  const logo = lies("public/brand/cheftreff-logo.svg");
  const pfade = (quelle: string) => [...quelle.matchAll(/<path\s+d="([^"]+)"/g)].map((t) => t[1]);

  it("die Pfade sind die aus `public/brand/cheftreff-logo.svg`, keine nachgezeichnete Fassung", () => {
    assert.equal(pfade(logo).length, 3);
    assert.deepEqual(pfade(svg), pfade(logo));
  });

  it("der Grund trägt die Originalfarbe der Marke, die Marke den Wert von `--ct-on-navy` (ändert sich eine Quelle: Skript neu laufen lassen)", () => {
    assert.match(GRUND, /^#[0-9a-f]{6}$/);
    assert.match(ZEICHEN, /^#[0-9a-f]{6}$/);
    assert.match(svg, new RegExp(`<rect [^>]*fill="${GRUND}"`));
    assert.match(svg, new RegExp(`<g [^>]*fill="${ZEICHEN}"`));
  });

  it("ein Quadrat mit abgerundeten Ecken, 64 × 64", () => {
    assert.match(svg, /<svg [^>]*viewBox="0 0 64 64"/);
    assert.match(svg, /<rect width="64" height="64" rx="\d+"/);
  });

  it("die Datei lädt als Bild: in einem XML-Kommentar steht kein `--` (die erste Fassung scheiterte daran)", () => {
    for (const kommentar of svg.matchAll(/<!--([\s\S]*?)-->/g)) assert.doesNotMatch(kommentar[1], /--/);
    assert.ok(svg.trim().endsWith("</svg>"));
  });
});

describe("Der Proxy lässt die Icons durch (auch vor der Anmeldung)", () => {
  // Der Matcher aus `proxy.ts` in der Schreibweise von Next (`/` + eine Gruppe): als Ausdruck gelesen.
  const quelle = lies("proxy.ts");
  const zeichenkette = /matcher:\s*\[\s*(?:\/\/[^\n]*\n\s*)*("(?:[^"\\]|\\.)*")/.exec(quelle)?.[1] ?? "";
  const matcher = new RegExp(`^${JSON.parse(zeichenkette)}$`);

  it("`/favicon.ico`, `/icon.svg` und `/apple-icon.png` laufen nicht durch den Proxy", () => {
    for (const pfad of ["/favicon.ico", "/icon.svg", "/apple-icon.png"]) assert.equal(matcher.test(pfad), false, pfad);
  });

  it("gegengeprüft: Seiten laufen weiter durch den Proxy", () => {
    for (const pfad of ["/login", "/partner", "/admin/grafiken"]) assert.equal(matcher.test(pfad), true, pfad);
  });
});

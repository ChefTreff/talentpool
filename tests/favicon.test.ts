import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { inflateSync } from "node:zlib";

/**
 * QS-071 (Konrad & Leopold 05.10.): in der Browser-Leiste stand noch das Vercel-Logo, die Vorgabe von create-next-app.
 * Jetzt trägt jede Seite das ChefTreff-Logo als Icon: `app/icon.svg`, `app/favicon.ico` und `app/apple-icon.png` legt
 * Next selbst als <link> an (Dateikonvention). Erzeugt werden sie von `scripts/icons-erzeugen.mjs` aus der Bildmarke
 * und den Farb-Tokens; hier steht, was an den Dateien feststehen muss — vor allem, dass sie echte Bilder sind.
 */

const lies = (pfad: string) => readFileSync(pfad, "utf8");
const css = lies("app/globals.css");
const token = (name: string) => new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\b`).exec(css)?.[1].toLowerCase() ?? "";
const NAVY = token("ct-navy");
const AUF_NAVY = token("ct-on-navy");

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
    it(`Bild ${groesse} px: Verzeichnis und PNG stimmen überein, Mitte ist die Marke, Rand ist Navy oder abgerundet`, () => {
      const eintrag = 6 + nr * 16;
      assert.equal(ico[eintrag], groesse);
      assert.equal(ico[eintrag + 1], groesse);
      const laenge = ico.readUInt32LE(eintrag + 8);
      const versatz = ico.readUInt32LE(eintrag + 12);
      const bild = dekodiere(ico.subarray(versatz, versatz + laenge));
      assert.equal(bild.breite, groesse);
      assert.equal(bild.hoehe, groesse);
      // Die Mitte liegt im mittleren Sechseck der Marke.
      assert.equal(hex(bild.an(groesse / 2, groesse / 2)), AUF_NAVY);
      assert.equal(bild.an(groesse / 2, groesse / 2)[3], 255);
      // Die Ecke ist abgerundet, also (fast) durchsichtig; die Mitte der obersten Reihe liegt im Quadrat und ist Navy.
      assert.ok(bild.an(0, 0)[3] < 40, "Ecke durchsichtig");
      assert.equal(hex(bild.an(groesse / 2, 1)), NAVY);
    });
  }
});

describe("apple-icon.png: 180 px, deckend bis an den Rand", () => {
  const bild = dekodiere(readFileSync("app/apple-icon.png"));

  it("180 × 180", () => {
    assert.equal(bild.breite, 180);
    assert.equal(bild.hoehe, 180);
  });

  it("alle vier Ecken sind Navy und undurchsichtig (iOS rundet selbst ab, Durchsichtiges würde schwarz)", () => {
    for (const [x, y] of [[0, 0], [179, 0], [0, 179], [179, 179]]) {
      assert.equal(hex(bild.an(x, y)), NAVY);
      assert.equal(bild.an(x, y)[3], 255);
    }
  });

  it("die Mitte ist die Marke in der Textfarbe auf Navy", () => {
    assert.equal(hex(bild.an(90, 90)), AUF_NAVY);
  });
});

describe("icon.svg: die echte Bildmarke in den Farben der Tokens", () => {
  const svg = lies("app/icon.svg");
  const logo = lies("public/brand/cheftreff-logo.svg");
  const pfade = (quelle: string) => [...quelle.matchAll(/<path\s+d="([^"]+)"/g)].map((t) => t[1]);

  it("die Pfade sind die aus `public/brand/cheftreff-logo.svg`, keine nachgezeichnete Fassung", () => {
    assert.equal(pfade(logo).length, 3);
    assert.deepEqual(pfade(svg), pfade(logo));
  });

  it("Grund und Marke tragen die Werte von `--ct-navy` und `--ct-on-navy` (ändert sich ein Token: Skript neu laufen lassen)", () => {
    assert.match(NAVY, /^#[0-9a-f]{6}$/);
    assert.match(AUF_NAVY, /^#[0-9a-f]{6}$/);
    assert.match(svg, new RegExp(`<rect [^>]*fill="${NAVY}"`));
    assert.match(svg, new RegExp(`<g [^>]*fill="${AUF_NAVY}"`));
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

#!/usr/bin/env node
/**
 * QS-071: erzeugt die Icons des Portals aus der Bildmarke und den Farb-Tokens — kein Hex von Hand, keine Abhängigkeit.
 *
 *   app/icon.svg        Vektor für moderne Browser (Next legt das <link rel="icon"> selbst an)
 *   app/favicon.ico     16, 32 und 48 px für alles andere (ersetzt die Vorgabe von create-next-app, das Vercel-Logo)
 *   app/apple-icon.png  180 px, deckend bis an den Rand (iOS rundet selbst ab)
 *
 * Quellen: `public/brand/cheftreff-logo.svg` (Pfade der Bildmarke), `public/brand/original/cheftreff-logo-original.svg`
 * (die Farbe, in der die Marke gezeichnet ist: Violett #5454C5) und `app/globals.css` (`--ct-on-navy`).
 * Die Marke steht in Off-White auf einem Quadrat in der Originalfarbe der Marke (K-73 Q7, Konrad 08.10.: eine Variante in
 * Violett zum Testen; erste Fassung #361: Navy wie in der Seitenleiste): Off-White gegen Violett 5,5 : 1, und das Quadrat
 * hebt sich auf hellen wie auf dunklen Tab-Leisten ab.
 *
 * Aufruf (aus dem Repo-Ordner): node scripts/icons-erzeugen.mjs
 * Nach einer Änderung an Logo, Originalfarbe oder Token neu laufen lassen und die drei Dateien mit einchecken;
 * `tests/favicon.test.ts` prüft, dass die Dateien zu den Quellen passen.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), "..");
const lies = (pfad) => readFileSync(join(WURZEL, pfad), "utf8");

/** Ein Farb-Token aus `app/globals.css` als Hex-Wert. */
function token(css, name) {
  const treffer = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\b`).exec(css);
  if (!treffer) throw new Error(`Token --${name} steht nicht (mehr) in app/globals.css`);
  return treffer[1].toLowerCase();
}

/** Die Farbe der Originaldatei der Marke: alle Pfade tragen dieselbe. Eine zweite Farbe bricht ab, statt eine zu raten. */
function originalfarbe(svg) {
  const farben = new Set([...svg.matchAll(/<path\b[^>]*\bfill="(#[0-9a-fA-F]{6})"/g)].map((t) => t[1].toLowerCase()));
  if (farben.size !== 1) {
    throw new Error(`public/brand/original/cheftreff-logo-original.svg: erwartet eine Farbe für alle Pfade, gefunden ${farben.size}`);
  }
  return [...farben][0];
}

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** Die Pfade der Bildmarke: nur M, L, H, V, Z (absolut). Alles andere bricht laut ab, statt falsch zu zeichnen. */
function marke(svg) {
  const pfade = [...svg.matchAll(/<path\s+d="([^"]+)"/g)].map((t) => t[1]);
  if (pfade.length === 0) throw new Error("public/brand/cheftreff-logo.svg: keine Pfade gefunden");
  const polygone = pfade.map((d) => {
    if (/[^MLHVZ0-9.,\s-]/.test(d)) throw new Error("cheftreff-logo.svg: nur M, L, H, V und Z (absolut) werden gelesen");
    const teile = d.match(/[MLHVZ]|-?\d*\.?\d+/g);
    const punkte = [];
    let x = 0;
    let y = 0;
    let befehl = "";
    for (let i = 0; i < teile.length; ) {
      if (/[MLHVZ]/.test(teile[i])) befehl = teile[i++];
      if (befehl === "Z") {
        if (i < teile.length && !/[MLHVZ]/.test(teile[i])) throw new Error("cheftreff-logo.svg: Zahlen nach Z");
        continue;
      }
      if (befehl === "M" || befehl === "L") {
        x = Number(teile[i++]);
        y = Number(teile[i++]);
      } else if (befehl === "H") x = Number(teile[i++]);
      else y = Number(teile[i++]);
      punkte.push([x, y]);
    }
    return punkte;
  });
  const xs = polygone.flat().map((p) => p[0]);
  const ys = polygone.flat().map((p) => p[1]);
  const rahmen = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  return { pfade, polygone, rahmen };
}

/** Maßstab und Versatz, mit dem die Marke `anteil` der Breite einnimmt und mittig sitzt. */
function platzierung({ rahmen }, groesse, anteil) {
  const breite = rahmen.x1 - rahmen.x0;
  const hoehe = rahmen.y1 - rahmen.y0;
  const s = (anteil * groesse) / breite;
  return { s, ox: (groesse - breite * s) / 2 - rahmen.x0 * s, oy: (groesse - hoehe * s) / 2 - rahmen.y0 * s };
}

const imPolygon = (px, py, polygon) => {
  let innen = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) innen = !innen;
  }
  return innen;
};

/** Liegt der Punkt im Quadrat mit abgerundeten Ecken (Radius 0: überall)? */
function imQuadrat(x, y, groesse, radius) {
  if (radius === 0) return true;
  const mx = Math.min(Math.max(x, radius), groesse - radius);
  const my = Math.min(Math.max(y, radius), groesse - radius);
  return (x - mx) ** 2 + (y - my) ** 2 <= radius ** 2;
}

const UNTERPROBEN = 8; // je Achse und Pixel: 64 Proben, glatte Kanten ohne Treppen

/** RGBA-Pixel (gerade, nicht vormultipliziert): Marke auf Quadrat, Ränder mit Deckkraft. */
function raster(m, { groesse, anteil, radius, grund, zeichen }) {
  const { s, ox, oy } = platzierung(m, groesse, anteil);
  const polygone = m.polygone.map((p) => p.map(([x, y]) => [x * s + ox, y * s + oy]));
  const pixel = Buffer.alloc(groesse * groesse * 4);
  for (let y = 0; y < groesse; y++) {
    for (let x = 0; x < groesse; x++) {
      let da = 0;
      const summe = [0, 0, 0];
      for (let v = 0; v < UNTERPROBEN; v++) {
        for (let u = 0; u < UNTERPROBEN; u++) {
          const fx = x + (u + 0.5) / UNTERPROBEN;
          const fy = y + (v + 0.5) / UNTERPROBEN;
          if (!imQuadrat(fx, fy, groesse, radius)) continue;
          da++;
          const farbe = polygone.some((p) => imPolygon(fx, fy, p)) ? zeichen : grund;
          for (let k = 0; k < 3; k++) summe[k] += farbe[k];
        }
      }
      const o = (y * groesse + x) * 4;
      for (let k = 0; k < 3; k++) pixel[o + k] = da ? Math.round(summe[k] / da) : 0;
      pixel[o + 3] = Math.round((da / UNTERPROBEN ** 2) * 255);
    }
  }
  return pixel;
}

const CRC_TABELLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (daten) => {
  let c = 0xffffffff;
  for (const b of daten) c = CRC_TABELLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function block(art, daten) {
  const laenge = Buffer.alloc(4);
  laenge.writeUInt32BE(daten.length);
  const rumpf = Buffer.concat([Buffer.from(art, "ascii"), daten]);
  const pruefsumme = Buffer.alloc(4);
  pruefsumme.writeUInt32BE(crc32(rumpf));
  return Buffer.concat([laenge, rumpf, pruefsumme]);
}

/** PNG, 8 Bit RGBA, ohne Filter (Filtertyp 0 je Zeile — so liest es auch der Test). */
function png(groesse, pixel) {
  const zeile = groesse * 4 + 1;
  const roh = Buffer.alloc(zeile * groesse);
  for (let y = 0; y < groesse; y++) pixel.copy(roh, y * zeile + 1, y * groesse * 4, (y + 1) * groesse * 4);
  const kopf = Buffer.alloc(13);
  kopf.writeUInt32BE(groesse, 0);
  kopf.writeUInt32BE(groesse, 4);
  kopf[8] = 8; // Bits je Kanal
  kopf[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    block("IHDR", kopf),
    block("IDAT", deflateSync(roh, { level: 9 })),
    block("IEND", Buffer.alloc(0)),
  ]);
}

/** ICO mit PNG-Bildern (seit Windows Vista und in allen Browsern gelesen). */
function ico(bilder) {
  const kopf = Buffer.alloc(6);
  kopf.writeUInt16LE(1, 2); // Typ: Symbol
  kopf.writeUInt16LE(bilder.length, 4);
  let versatz = kopf.length + bilder.length * 16;
  const verzeichnis = bilder.map(({ groesse, daten }) => {
    const eintrag = Buffer.alloc(16);
    eintrag[0] = groesse;
    eintrag[1] = groesse;
    eintrag.writeUInt16LE(1, 4); // Farbebenen
    eintrag.writeUInt16LE(32, 6); // Bits je Pixel
    eintrag.writeUInt32LE(daten.length, 8);
    eintrag.writeUInt32LE(versatz, 12);
    versatz += daten.length;
    return eintrag;
  });
  return Buffer.concat([kopf, ...verzeichnis, ...bilder.map((b) => b.daten)]);
}

// Je Größe ein eigenes Verhältnis: bei 16 px muss die Marke fast die ganze Breite nehmen, damit sie noch zu lesen ist;
// im Vektor und auf dem iPhone braucht sie Luft.
const BILDER = {
  svg: { groesse: 64, anteil: 0.75, radius: 14 },
  ico: [
    { groesse: 16, anteil: 0.86, radius: 3 },
    { groesse: 32, anteil: 0.82, radius: 7 },
    { groesse: 48, anteil: 0.78, radius: 10 },
  ],
  apple: { groesse: 180, anteil: 0.66, radius: 0 },
};

export function baueIcons(css, logoSvg, originalSvg) {
  const grund = originalfarbe(originalSvg);
  const zeichen = token(css, "ct-on-navy");
  const m = marke(logoSvg);

  const { groesse, anteil, radius } = BILDER.svg;
  const { s, ox, oy } = platzierung(m, groesse, anteil);
  const zahl = (n) => String(Number(n.toFixed(5)));
  const svg = [
    // In einem XML-Kommentar darf "--" nicht stehen; sonst lädt der Browser die Datei nicht als Bild.
    `<!-- Erzeugt von scripts/icons-erzeugen.mjs aus public/brand/cheftreff-logo.svg, der Originalfarbe der Marke (${grund}) in`,
    `     public/brand/original/ und dem Token ct-on-navy (${zeichen}) in app/globals.css. Nicht von Hand ändern, sondern das`,
    `     Skript neu laufen lassen. -->`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${groesse} ${groesse}" width="${groesse}" height="${groesse}">`,
    `<rect width="${groesse}" height="${groesse}" rx="${radius}" fill="${grund}"/>`,
    `<g transform="translate(${zahl(ox)} ${zahl(oy)}) scale(${zahl(s)})" fill="${zeichen}">`,
    ...m.pfade.map((d) => `<path d="${d}"/>`),
    `</g>`,
    `</svg>`,
    ``,
  ].join("\n");

  const bild = (b) => png(b.groesse, raster(m, { ...b, grund: rgb(grund), zeichen: rgb(zeichen) }));
  return {
    "app/icon.svg": svg,
    "app/favicon.ico": ico(BILDER.ico.map((b) => ({ groesse: b.groesse, daten: bild(b) }))),
    "app/apple-icon.png": bild(BILDER.apple),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dateien = baueIcons(
    lies("app/globals.css"),
    lies("public/brand/cheftreff-logo.svg"),
    lies("public/brand/original/cheftreff-logo-original.svg"),
  );
  for (const [pfad, inhalt] of Object.entries(dateien)) {
    writeFileSync(join(WURZEL, pfad), inhalt);
    console.log(`${pfad}  ${Buffer.byteLength(inhalt)} Byte`);
  }
}

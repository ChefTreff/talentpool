import assert from "node:assert/strict";
import test from "node:test";
import { crc32, deflateSync } from "node:zlib";
import sharp from "sharp";
import {
  BILD_MIMES,
  MAX_EINGANG_PIXEL,
  MAX_KANTE,
  VORSCHAU_ENDUNG,
  verkleinere,
  vorschauPfad,
} from "@/lib/edition-files/verkleinern.mjs";

/**
 * Der Verkleinerungskern für Editionsbilder (ADM-042) mit den Auflagen der
 * Architektur-Session: höchstens 2000 px, WebP, Ausrichtung übernommen,
 * Metadaten weg, Eingang begrenzt.
 */

test("ein grosser Plan wird auf die lange Kante verkleinert, Seitenverhältnis bleibt", async () => {
  // Querformat wie Konrads Hallenplan (8503 × 6062), hier massstäblich kleiner.
  const gross = await sharp({ create: { width: 4251, height: 3031, channels: 3, background: "#ffffff" } }).png().toBuffer();
  const klein = await verkleinere(gross);
  assert.equal(klein.width, MAX_KANTE);
  assert.equal(klein.height, Math.round((3031 / 4251) * MAX_KANTE));
  const meta = await sharp(klein.buffer).metadata();
  assert.equal(meta.format, "webp");
});

test("ein kleines Bild wird nicht vergrössert", async () => {
  const klein = await verkleinere(
    await sharp({ create: { width: 800, height: 600, channels: 3, background: "#000000" } }).jpeg().toBuffer(),
  );
  assert.deepEqual([klein.width, klein.height], [800, 600]);
});

test("EXIF-Ausrichtung wird übernommen, Metadaten verschwinden", async () => {
  // Hochformat-Foto, als Querformat gespeichert mit Orientation 6 (90° drehen).
  const foto = await sharp({ create: { width: 300, height: 200, channels: 3, background: "#336699" } })
    .jpeg()
    .withMetadata({ orientation: 6, exif: { IFD0: { Make: "ZZTEST-Kamera" } } })
    .toBuffer();
  assert.equal((await sharp(foto).metadata()).orientation, 6, "Vorbedingung: Testbild trägt die Drehung");

  const klein = await verkleinere(foto);
  assert.deepEqual([klein.width, klein.height], [200, 300], "gedreht, also Hochformat");
  const meta = await sharp(klein.buffer).metadata();
  assert.equal(meta.exif, undefined, "keine EXIF-Daten in der Vorschau");
  assert.equal(meta.orientation, undefined);
});

test("Eingangsgrenze und Pfadregel stehen, wie die Migration sie erwartet", () => {
  assert.equal(MAX_EINGANG_PIXEL, 80_000_000);
  assert.ok(8503 * 6062 < MAX_EINGANG_PIXEL, "Konrads Hallenplan passt hinein");
  assert.equal(VORSCHAU_ENDUNG, ".preview.webp");
  assert.equal(vorschauPfad("ed/hallenplan/x.png"), "ed/hallenplan/x.png.preview.webp");
  assert.deepEqual([...BILD_MIMES].sort(), ["image/jpeg", "image/png", "image/webp"]);
});

test("ein Bild über der Eingangsgrenze wird am Kopf abgewiesen, nicht dekodiert", async () => {
  // Ein PNG, dessen Kopf 9000 × 9000 (81 MP) behauptet und danach endet. Wäre
  // die Grenze nicht gesetzt, versuchte sharp zu dekodieren und scheiterte an
  // den fehlenden Daten — mit einer anderen Meldung. So belegt der Test, dass
  // vor dem Dekodieren abgewiesen wird.
  const breite = 9000;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(breite, 0);
  ihdr.writeUInt32BE(breite, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8 Bit, RGB
  const block = (art: string, inhalt: Buffer) => {
    const typ = Buffer.from(art);
    const laenge = Buffer.alloc(4);
    laenge.writeUInt32BE(inhalt.length, 0);
    const pruef = Buffer.alloc(4);
    pruef.writeUInt32BE(crc32(Buffer.concat([typ, inhalt])) >>> 0, 0);
    return Buffer.concat([laenge, typ, inhalt, pruef]);
  };
  // Ein winziger Datenblock: viel zu kurz für 81 MP, gültig genug zum Lesen des Kopfes.
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    block("IHDR", ihdr),
    block("IDAT", deflateSync(Buffer.alloc(16))),
    block("IEND", Buffer.alloc(0)),
  ]);
  assert.ok(breite * breite > MAX_EINGANG_PIXEL);
  await assert.rejects(() => verkleinere(png), /pixel limit/i);
});

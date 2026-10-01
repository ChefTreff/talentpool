/**
 * Verkleinerte Anzeigefassung für Editionsbilder (ADM-042).
 *
 * Ein eigenes `.mjs` ohne `server-only` und ohne Alias, damit die Upload-Route
 * **und** das Nachholskript (`scripts/editionsdatei-vorschau.mjs`) dieselbe
 * Regel benutzen. Läuft nur auf dem Server: `sharp` ist eine native Bibliothek.
 *
 * Auflagen der Architektur-Session (01.10.2026):
 * - Eingang begrenzt (`limitInputPixels`) — ein präpariertes Bild mit
 *   riesigen Kantenlängen soll den Speicher nicht sprengen.
 * - Ausgabe höchstens 2000 px lange Kante, WebP.
 * - Ausrichtung nach EXIF übernehmen (`rotate()`), danach **ohne** Metadaten
 *   speichern — `sharp` schreibt keine, solange niemand `withMetadata()` sagt.
 *   Kamera, Ort und Uhrzeit eines Fotos gehören nicht in die Anzeigefassung.
 * - Das Original bleibt unverändert und ist der Download.
 */
import sharp from "sharp";

/** Fester Name neben dem Original — der Prüfsatz `edition_file_preview_chk` verlangt genau ihn. */
export const VORSCHAU_ENDUNG = ".preview.webp";
export const MAX_KANTE = 2000;
/** Bewusst gesetzt: Konrads Hallenplan hat 51 MP; 80 MP lassen Luft, ohne offen zu sein. */
export const MAX_EINGANG_PIXEL = 80_000_000;
/** Nur Rasterbilder. PDF und SVG bekommen keine Vorschau — SVG skaliert ohnehin. */
export const BILD_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);

/** @param {string} pfad */
export function vorschauPfad(pfad) {
  return pfad + VORSCHAU_ENDUNG;
}

/**
 * @param {Buffer | Uint8Array} eingang
 * @returns {Promise<{ buffer: Buffer; width: number; height: number }>}
 */
export async function verkleinere(eingang) {
  const { data, info } = await sharp(eingang, { limitInputPixels: MAX_EINGANG_PIXEL, failOn: "error" })
    .rotate()
    .resize({ width: MAX_KANTE, height: MAX_KANTE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer({ resolveWithObject: true });
  return { buffer: data, width: info.width, height: info.height };
}

/**
 * Gemeinsames für Media Kit und Partnergrafik (PART-041, ADM-023) — rein, damit
 * es sich ohne Server prüfen lässt. Die Grenzen sind dieselben wie in den
 * Routen `/api/admin/media-kit` und `/api/admin/partnergrafik` und in
 * `set_partner_graphic`; der Browser prüft vorher, damit niemand 20 MB hochlädt,
 * die hinterher abgewiesen werden.
 */

/** Media Kit: PDF, Bilder und ZIP-Pakete (Bucket `edition-files` seit `v6_media_kit`). */
export const MEDIA_KIT_ERLAUBT = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "application/zip",
];
export const MEDIA_KIT_MAX_BYTES = 25 * 1024 * 1024;

/**
 * Für wen eine Datei des Media Kits gilt (SPK-090): Partner (`/partner/media`) und Speaker (`/speaker/media`). Die
 * übrigen Zielgruppen des Vokabulars `kb_audience` gehören nicht hierher — das Media Kit ist Material für die eigenen
 * Beiträge von Partnern und Speakern.
 */
export const MEDIA_KIT_ZIELGRUPPEN = ["partner", "speaker"] as const;
export type MediaKitZielgruppe = (typeof MEDIA_KIT_ZIELGRUPPEN)[number];

/**
 * Prüft die Zielgruppen aus einer Anfrage: eine Liste, nur Partner und Speaker, mindestens eine — in fester
 * Reihenfolge und ohne Doppelte; sonst `null`.
 *
 * **Nie leer an `set_edition_file`**: beim Anlegen machte die Funktion aus einer leeren Liste „alle fünf Zielgruppen“
 * (Talent, Volunteers, Hackathon eingeschlossen), beim Ändern ließe sie die alte stehen. Beides wäre still falsch.
 */
export function mediaKitZielgruppen(roh: unknown): MediaKitZielgruppe[] | null {
  if (!Array.isArray(roh)) return null;
  const gewaehlt = new Set<unknown>(roh);
  for (const z of gewaehlt) if (!MEDIA_KIT_ZIELGRUPPEN.includes(z as MediaKitZielgruppe)) return null;
  const liste = MEDIA_KIT_ZIELGRUPPEN.filter((z) => gewaehlt.has(z));
  return liste.length > 0 ? liste : null;
}

/** Ein Kästchen umschalten. Die **letzte** angehakte Zielgruppe bleibt: eine Datei ohne Zielgruppe sähe niemand. */
export function zielgruppeUmschalten(
  aktuell: readonly MediaKitZielgruppe[],
  z: MediaKitZielgruppe,
): MediaKitZielgruppe[] {
  const an = aktuell.includes(z);
  if (an && aktuell.length === 1) return [...aktuell];
  const neu = new Set(an ? aktuell.filter((x) => x !== z) : [...aktuell, z]);
  return MEDIA_KIT_ZIELGRUPPEN.filter((x) => neu.has(x));
}

/** Partnergrafik: eine Grafik zum Teilen, Bild oder PDF. */
export const GRAFIK_ERLAUBT = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
export const GRAFIK_MAX_BYTES = 25 * 1024 * 1024;

/** „1,2 MB“, „340 KB“ — `null` ohne Angabe. */
export function dateiGroesse(bytes: number | null | undefined, locale: string): string | null {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return null;
  const zahl = (n: number, stellen: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: stellen }).format(n);
  if (bytes >= 1024 * 1024) return `${zahl(bytes / (1024 * 1024), 1)} MB`;
  return `${zahl(Math.max(1, Math.round(bytes / 1024)), 0)} KB`;
}

/** Lässt sich die Datei als Vorschau zeigen? PDF und ZIP nicht. */
export function istBild(mime: string | null | undefined): boolean {
  return mime === "image/png" || mime === "image/jpeg" || mime === "image/webp" || mime === "image/svg+xml";
}

/** Titel in der Sprache der Person, sonst der deutsche, sonst der Dateiname. */
export function dateiTitel(
  datei: { label_de: string | null; label_en: string | null; filename: string },
  locale: string,
): string {
  return (locale === "en" ? datei.label_en : null) ?? datei.label_de ?? datei.label_en ?? datei.filename;
}

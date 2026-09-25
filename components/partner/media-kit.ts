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

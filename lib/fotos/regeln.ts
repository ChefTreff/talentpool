/** Event-Fotos (TAL-010) — Regeln für Route, Upload und Tests; der Bucket prüft noch einmal. */
export const PHOTO_BUCKET = "event-photos";
/** Wie der Bucket: 15 MB je Bild. */
export const PHOTO_MAX_BYTES = 15 * 1024 * 1024;
export const PHOTO_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export function pruefeFoto(file: { size: number; type: string }): { ok: true } | { ok: false; key: "too_large" | "wrong_type" } {
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > PHOTO_MAX_BYTES) return { ok: false, key: "too_large" };
  if (!PHOTO_MIME.has(file.type)) return { ok: false, key: "wrong_type" };
  return { ok: true };
}

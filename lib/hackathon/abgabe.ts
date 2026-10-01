/**
 * Dateien einer Hackathon-Abgabe (HACK-011) — Regeln für Route, Upload und
 * Tests. Der Bucket `hack-submissions` prüft Größe und MIME-Typ noch einmal.
 */
export { speicherPfad } from "@/lib/hackathon/datensatz";

export const SUBMISSION_BUCKET = "hack-submissions";

/** Wie der Bucket: 50 MB je Datei. Größere Videos als Link in der Abgabe. */
export const SUBMISSION_MAX_BYTES = 50 * 1024 * 1024;

/** Höchstens so viele Dateien je Team (dieselbe Zahl prüft `register_hack_submission_file`). */
export const SUBMISSION_MAX_FILES = 10;

export const SUBMISSION_EXT = ["pdf", "pptx", "ppt", "key", "zip", "png", "jpg", "jpeg", "webp", "mp4", "mov", "txt", "csv", "json"] as const;

export const SUBMISSION_MIME = new Set([
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
  "application/vnd.apple.keynote",
  "image/png",
  "image/jpeg",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "text/plain",
  "text/csv",
  "application/json",
  "application/octet-stream",
]);

function endung(filename: string): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(filename);
  return m ? m[1].toLowerCase() : "";
}

/** Prüfung vor dem Signieren — dieselbe Regel im Browser und in der Route. */
export function pruefeAbgabeDatei(file: { name: string; size: number; type: string }):
  | { ok: true; mime: string }
  | { ok: false; key: "too_large" | "wrong_type" } {
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > SUBMISSION_MAX_BYTES) return { ok: false, key: "too_large" };
  if (!(SUBMISSION_EXT as readonly string[]).includes(endung(file.name))) return { ok: false, key: "wrong_type" };
  const mime = file.type || "application/octet-stream";
  if (!SUBMISSION_MIME.has(mime)) return { ok: false, key: "wrong_type" };
  return { ok: true, mime };
}

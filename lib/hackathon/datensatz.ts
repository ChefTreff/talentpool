/**
 * Datensatz je Hackathon-Challenge (HACK-012) — die Regeln, die Route,
 * Upload-Komponente und Tests teilen. Der Bucket selbst prüft Größe und
 * MIME-Typ noch einmal (`v6_hack_datensatz`).
 */
export const DATASET_BUCKET = "hack-datasets";

/** Wie der Bucket: 50 MB. Größere Daten als Link unter „Ressourcen“. */
export const DATASET_MAX_BYTES = 50 * 1024 * 1024;

/** Erlaubte Endungen; Browser liefern für Parquet oft keinen MIME-Typ. */
export const DATASET_EXT = ["csv", "tsv", "json", "parquet", "zip", "gz", "xlsx", "txt", "pdf"] as const;

/** MIME-Typen des Buckets; leerer Typ wird zu `application/octet-stream`. */
export const DATASET_MIME = new Set([
  "text/csv",
  "text/tab-separated-values",
  "application/json",
  "text/plain",
  "application/zip",
  "application/gzip",
  "application/x-gzip",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.apache.parquet",
  "application/octet-stream",
]);

export function datasetExt(filename: string): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(filename);
  return m ? m[1].toLowerCase() : "";
}

/** Prüfung vor dem Signieren — dieselbe Regel im Browser und in der Route. */
export function pruefeDatensatz(file: { name: string; size: number; type: string }):
  | { ok: true; mime: string }
  | { ok: false; key: "too_large" | "wrong_type" } {
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > DATASET_MAX_BYTES) return { ok: false, key: "too_large" };
  if (!(DATASET_EXT as readonly string[]).includes(datasetExt(file.name))) return { ok: false, key: "wrong_type" };
  const mime = file.type || "application/octet-stream";
  if (!DATASET_MIME.has(mime)) return { ok: false, key: "wrong_type" };
  return { ok: true, mime };
}

/** Pfad im Bucket: `<challenge_id>/<uuid>-<name>`; der Name ist ein Schlüssel, kein Anzeigetext. */
export function datasetPfad(challengeId: string, filename: string, uuid: string): string {
  const sauber = filename
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+/, "")
    .slice(-80);
  return `${challengeId}/${uuid}-${sauber || "dataset"}`;
}

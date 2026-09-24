/**
 * Regeln für das Porträt im Teilnehmer-Profil (TAL-012). Stehen hier und nicht
 * im Formular, weil Browser (Vorprüfung) und Test dieselben Werte lesen; die
 * harte Grenze sind Bucket (`person-photos`, 5 MB, drei Bildtypen) und
 * `set_my_photo` in der Datenbank.
 */
export const PORTRAIT_BUCKET = "person-photos";
export const PORTRAIT_MIME = ["image/jpeg", "image/png", "image/webp"];
export const MAX_PORTRAIT_BYTES = 5 * 1024 * 1024;
/** Lebensdauer der signierten Anzeige-Adresse: eine Sitzung auf der Seite. */
export const PORTRAIT_URL_SECONDS = 60 * 60;

/** Dateiname für den Objektschlüssel entschärfen (wie beim Speaker-Foto). */
function safeFileName(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+/, "");
  return (cleaned || "portraet").slice(-80);
}

/**
 * Pfad `<person_id>/<uuid>-<datei>` — genau zwei Segmente, wie
 * `person_photo_path_allowed` sie verlangt. Die UUID macht jeden Upload
 * eindeutig; das alte Bild räumt `set_my_photo` über die Löschliste weg.
 */
export function portraitPath(personId: string, fileName: string, id: string): string {
  return `${personId}/${id}-${safeFileName(fileName)}`;
}

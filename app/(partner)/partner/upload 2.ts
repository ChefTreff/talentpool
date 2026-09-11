/** Bucket und Dateinamen des Partner-Bereichs — geteilt von Onboarding und Checkliste. */

export const BUCKET = "partner-assets";

/**
 * Dateinamen auf das reduzieren, was in einem Storage-Pfad nicht stört.
 * Der Originalname bleibt als `filename` am Datensatz erhalten.
 */
export function safeFileName(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+/, "");
  return (cleaned || "datei").slice(-80);
}

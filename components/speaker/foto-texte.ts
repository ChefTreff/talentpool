/**
 * Die Texte des Foto-Uploads (SPK-004, LEAD-029) als Auszug aus `speaker` —
 * damit Lead-Fenster und Admin-Detail nicht das ganze Wörterbuch in den
 * Browser tragen. Bewusst ohne "use client": die Seiten rufen es auf dem Server.
 */
export const FOTO_TEXTE = [
  "photoTitle",
  "photoLead",
  "photoTitleManaged",
  "photoLeadManaged",
  "photoNone",
  "photoDone",
  "photoRules",
  "photoTooBig",
  "photoWrongType",
  "photoFailed",
  "photoPreviewAlt",
  "photoUploading",
  "photoReplace",
  "photoUpload",
  "commonUpload",
  "commonChangeFile",
] as const;

export function fotoTexte(t: Record<string, string>): Record<string, string> {
  return Object.fromEntries(FOTO_TEXTE.map((k) => [k, t[k] ?? k]));
}

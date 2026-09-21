/** Der Bucket, in dem Bühnenfotos und Slot-Grafiken liegen (0122). */
export const BUCKET = "session-assets";

/**
 * Wie lange eine Vorschau- oder Download-URL gilt.
 *
 * Eine halbe Stunde: lang genug, um in Ruhe alle Fotos durchzusehen und
 * herunterzuladen, kurz genug, dass ein weitergegebener Link nichts wert ist.
 */
export const URL_GUELTIG_SEKUNDEN = 60 * 30;

/** Eine Zeile aus `my_session_photos()` (Migration 0122, `v6_session_grafiken`). */
export type SessionPhoto = {
  id: string;
  session_id: string;
  session_title: string | null;
  start_at: string | null;
  storage_path: string;
  filename: string;
  credit: string | null;
  created_at: string;
};

/** Dasselbe Foto mit den beiden kurzlebigen URLs, die die Seite dafür zieht. */
export type PhotoMitUrls = SessionPhoto & {
  /** Zum Ansehen im `<img>`. */
  url: string | null;
  /** Mit `Content-Disposition: attachment` — der Knopf „Herunterladen". */
  downloadUrl: string | null;
};

/**
 * Die drei Vorlagen, in der Reihenfolge des Ablaufs: vorher, direkt danach,
 * im Rückblick. Die Texte stehen im Wörterbuch, nicht hier — Marketing pflegt
 * sie (ADM-027), und dafür müssen sie an einer Stelle liegen, die man ohne
 * Codeänderung erreicht.
 */
export const POST_VORLAGEN = ["announce", "live", "recap"] as const;
export type PostVorlage = (typeof POST_VORLAGEN)[number];

/** Eine Vorlage, fertig gefüllt und bereit zum Kopieren. */
export type GefuellterPost = {
  key: PostVorlage;
  label: string;
  hint: string;
  text: string;
};

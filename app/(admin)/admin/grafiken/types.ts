/** Eine Zeile aus `sessions_for_assets()` (Migration 0111). */
export type SessionZeile = {
  session_id: string;
  title: string | null;
  stage_name: string | null;
  start_at: string | null;
  speakers: string | null;
  /** Bühnenfotos insgesamt. */
  photos: number;
  /** Gültige Slot-Grafiken — höchstens eine. */
  graphics: number;
};

/** Eine Zeile aus `session_assets_admin()`, um eine signierte URL ergänzt. */
export type Bild = {
  id: string;
  session_id: string;
  session_title: string | null;
  stage_name: string | null;
  start_at: string | null;
  kind: "stage_photo" | "slot_graphic";
  storage_path: string;
  filename: string;
  cutout: boolean;
  credit: string | null;
  version: number;
  is_current: boolean;
  uploaded_by_name: string | null;
  created_at: string;
  /** Kurzlebig, vom Server erzeugt — steht nie in der Datenbank. */
  url: string | null;
};

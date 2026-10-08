/** Zeilen der Wissensbasis-RPCs (Migration 0083). */

export type KbArticle = {
  id: string;
  slug: string;
  title: string;
  body_md: string;
  phase: string;
  roles: string[];
  language: string;
  edition_id: string | null;
  updated_at: string;
  is_overlay: boolean;
  /** ADM-064: Thema (Vokabular `wiki_category`); `null` = kein Thema, im Portal „Weitere Artikel“. */
  category: string | null;
  /** PART-103: Produktbezug (Vokabular `partner_format`); leer = für alle. Relevanz, kein Zugriffsschutz. */
  product_formats: string[];
};

export type KbAdminArticle = KbArticle & {
  audience: string[];
  edition_slug: string | null;
  status: string;
  valid_until: string | null;
  owner_name: string | null;
  published_at: string | null;
};

export const KB_AUDIENCES = ["partner", "speaker", "talent", "volunteer", "hackathon"] as const;
export const KB_PHASES = ["evergreen", "vor", "aufbau", "event", "abbau"] as const;

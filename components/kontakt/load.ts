import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Zeile aus `my_contacts()` (Migration 0091). */
export type MeinKontakt = {
  id: string;
  type: string;
  display_name: string;
  role_label_de: string | null;
  role_label_en: string | null;
  email: string;
  phone: string;
  photo_path: string | null;
  via: string;
};

export type EditionInfo = {
  key: string;
  label_de: string | null;
  label_en: string | null;
  value_de: string | null;
  value_en: string | null;
  sort_order: number;
};

// `contactPhotoUrl` steht in `photo.ts` — diese Datei zieht den Server-Client
// herein und ist aus einer Client-Komponente nicht importierbar.
export { contactPhotoUrl } from "./photo";

/**
 * Die eigenen Ansprechpartner. Wer keine Zuordnung hat, bekommt eine leere
 * Liste — das ist kein Fehler, sondern die Regel (siehe 0091).
 */
export async function loadMyContacts(editionId?: string | null): Promise<MeinKontakt[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_contacts", { p_edition_id: editionId ?? null });
  if (error) {
    if (error.code !== "28000") console.error("[kontakt] my_contacts:", error.message);
    return [];
  }
  return (data ?? []) as MeinKontakt[];
}

/** Allgemeine Auskünfte für eine Zielgruppe. 42501 heisst: nicht zuständig. */
export async function loadEditionInfos(audience: string, editionId?: string | null): Promise<EditionInfo[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("edition_infos", {
    p_audience: audience,
    p_edition_id: editionId ?? null,
  });
  if (error) {
    if (error.code !== "42501" && error.code !== "28000") {
      console.error("[kontakt] edition_infos:", error.message);
    }
    return [];
  }
  return (data ?? []) as EditionInfo[];
}

import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { STORE_LINK_SCHLUESSEL, storeLinksAus, type StoreLinks } from "./store-links";

/**
 * Die Store-Links für eine Zielgruppe (`portal_links_for`, PART-072). Ohne
 * Recht oder ohne Anmeldung kommt nichts — die Seite lässt die Knöpfe dann weg,
 * statt zu scheitern; andere Fehler landen im Serverlog.
 */
export async function loadStoreLinks(audience: string, editionId?: string | null): Promise<StoreLinks> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("portal_links_for", {
    p_keys: Object.values(STORE_LINK_SCHLUESSEL),
    p_audience: audience,
    p_edition_id: editionId ?? null,
  });
  if (error) {
    if (error.code !== "42501" && error.code !== "28000") {
      console.error("[links] portal_links_for:", error.message);
    }
    return { appStore: null, googlePlay: null };
  }
  return storeLinksAus((data ?? []) as { key: string; url: string | null }[]);
}

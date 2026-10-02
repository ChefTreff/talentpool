import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Eine Zeile von `portal_links_for`. */
export type PortalLink = { key: string; title_de: string | null; title_en: string | null; url: string };

/**
 * Ein Link-Eintrag aus Admin → Medien → Links für eine Zielgruppe
 * (`portal_links_for`, PART-072) — die Edition-Zeile geht der für alle vor.
 *
 * Ohne Recht, ohne Anmeldung oder ohne Eintrag kommt `null`: die Seite lässt
 * den Abschnitt dann weg, statt zu scheitern (ein Rundgang ist ein Zusatz, kein
 * Versprechen); andere Fehler landen im Serverlog.
 */
export async function loadPortalLink(
  key: string,
  audience: string,
  editionId?: string | null,
): Promise<PortalLink | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("portal_links_for", {
    p_keys: [key],
    p_audience: audience,
    p_edition_id: editionId ?? null,
  });
  if (error) {
    if (error.code !== "42501" && error.code !== "28000") {
      console.error("[links] portal_links_for:", error.message);
    }
    return null;
  }
  return ((data ?? []) as PortalLink[]).find((z) => z.key === key) ?? null;
}

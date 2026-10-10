import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { HiringEintrag } from "@/components/partner/hiring";

/**
 * Die Einträge von „Wen sucht ihr?“ einer Organisation für die Vorbelegung der Wunschprofile (K-94 Stufe 2b, PART-140): Masterclass, Stopp der Company Tour und Interview Table
 * bieten „Aus ‚Wen sucht ihr?‘ übernehmen“ an. Gelesen wird über `partner_org_hiring` (jede Rolle der Organisation oder das Team) mit dem Sitzungs-Client — kein Service-Schlüssel.
 *
 * Die Vorbelegung ist eine Zugabe, kein Muss: schlägt der Aufruf fehl (etwa ohne Recht, `42501`), bleibt die Liste leer und die Maske zeigt den Hinweis statt der Auswahl; die
 * Seite fällt deshalb nie um. Andere Fehler stehen im Server-Log.
 */
export async function ladeHiring(supabase: SupabaseClient, orgId: string, editionId: string): Promise<HiringEintrag[]> {
  const { data, error } = await supabase.rpc("partner_org_hiring", { p_org_id: orgId, p_edition_id: editionId });
  if (error) {
    if (error.code !== "42501") console.error("[hiring] partner_org_hiring:", error.code, error.message);
    return [];
  }
  return (data ?? []) as HiringEintrag[];
}

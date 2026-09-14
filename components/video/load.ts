import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PortalVideo = {
  key: string;
  title_de: string | null;
  title_en: string | null;
  url: string;
};

/**
 * Das Video zu einem Schlüssel. Fehlt es, kommt `null` — die Seite lässt den
 * Block dann weg. Ein Kasten „hier wäre ein Video" ist schlechter als keiner.
 */
export async function loadVideo(key: string, audience: string, editionId?: string | null) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("portal_video_for", {
    p_key: key,
    p_audience: audience,
    p_edition_id: editionId ?? null,
  });
  if (error) {
    if (error.code !== "42501" && error.code !== "28000") {
      console.error("[video] portal_video_for:", error.message);
    }
    return null;
  }
  const row = (Array.isArray(data) ? data[0] : null) as PortalVideo | null;
  return row ?? null;
}

/**
 * Loom-Freigabelink → Einbettungsadresse.
 *
 * `loom.com/share/<id>` wird zu `loom.com/embed/<id>`. Der Freigabelink
 * selbst lässt sich nicht einbetten; in der Redaktion kopiert aber jeder den
 * Freigabelink, also rechnen wir hier um, statt es zu verlangen.
 */
export function loomEmbedUrl(url: string): string {
  return url.replace("/share/", "/embed/").split("?")[0];
}

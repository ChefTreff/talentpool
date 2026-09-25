import "server-only";
import type { createSupabaseServerClient } from "@/lib/supabase/server";

export type BoardEvent = { id: string; slug: string; name: string; timezone: string };

/**
 * Die Veranstaltungen, die Board und Tabelle anbieten — an einer Stelle, damit
 * die beiden Sichten nicht auseinanderlaufen.
 *
 * **Nur der Future Leader Summit** (LEAD-014, Konrad 24./25.09., in allen drei
 * Sichten): Tag 1 und Tag 2, kein Wechsel auf Nebenveranstaltungen. Der AI
 * Hackathon hatte eine Teststandbühne und stand deshalb hier, einen Tag vor
 * dem Summit sogar als Erster. Fehlt ein Summit (etwa eine neue Edition ohne
 * Tage), bleibt es bei allem, was Bühnen hat — sonst wäre das Board leer, ohne
 * dass jemand wüsste, warum.
 *
 * `editionIds` verengt auf diese Editionen (die Leads und Partner bekommen so
 * ihre eigene); leer oder `undefined` heißt: alle.
 */
export async function boardEvents(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  editionIds?: string[],
): Promise<BoardEvent[]> {
  const { data: eventRows } = await supabase
    .from("event")
    .select("id, slug, name, timezone, format_tag, edition_id, is_edition, stage(id)")
    .order("start_date");

  const scoped = new Set(editionIds ?? []);
  const bespielbar = ((eventRows ?? []) as (BoardEvent & {
    format_tag: string | null;
    edition_id: string | null;
    is_edition: boolean;
    stage: { id: string }[] | null;
  })[])
    .filter((e) => !e.is_edition && (e.stage?.length ?? 0) > 0)
    .filter((e) => scoped.size === 0 || (e.edition_id !== null && scoped.has(e.edition_id)));

  const summits = bespielbar.filter((e) => e.format_tag === "summit");
  return (summits.length > 0 ? summits : bespielbar).map(({ id, slug, name, timezone }) => ({
    id,
    slug,
    name,
    timezone,
  }));
}

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Die Veranstaltungstage einer Edition, aufsteigend und ohne Dubletten.
 *
 * Summit und Hackathon teilen sich Tage; `event_day` führt sie je Veranstaltung,
 * die Edition hat jeden Tag aber nur einmal. Gefiltert wird über beide Wege,
 * weil `edition_id` an der Unterveranstaltung hängt und die Edition selbst
 * ihre eigene `id` trägt.
 *
 * Steht hier und nicht in der Seite, seit die Termine auch in den Kalender
 * gehen (SPK-026) — dieselbe Liste an zwei Stellen wäre eine Gelegenheit, dass
 * sie auseinanderlaufen.
 */
export async function loadEventDays(
  supabase: SupabaseClient,
  editionId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("event_day")
    .select("day_date, event_id, event:event_id(edition_id, id)")
    .order("day_date");

  const tage = ((data ?? []) as unknown as {
    day_date: string;
    event: { edition_id: string | null; id: string } | { edition_id: string | null; id: string }[] | null;
  }[])
    .filter((d) => {
      const e = Array.isArray(d.event) ? d.event[0] : d.event;
      return e && (e.edition_id === editionId || e.id === editionId);
    })
    .map((d) => d.day_date);

  return [...new Set(tage)].sort();
}

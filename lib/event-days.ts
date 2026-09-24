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

/**
 * Der Summit einer Edition: Name und Tage der Unterveranstaltung mit
 * `format_tag = 'summit'` (SPK-048).
 *
 * Für Speaker ist der Summit Freitag und Samstag. Die Edition hat mehr Tage —
 * der Hackathon beginnt am Donnerstag —, und ihr Name ist das Kürzel „FLS27".
 * Übersicht und Kalendereintrag nehmen deshalb die Unterveranstaltung. Fehlt
 * sie oder hat sie keine Tage, bleibt es bei allen Tagen der Edition, und
 * `name` ist `null` — dann nimmt die Seite den Namen der Edition.
 *
 * Anreise, Hotel und Shuttle rechnen weiter mit `loadEventDays`: dort zählt
 * der Donnerstag mit.
 */
export async function loadSummit(
  supabase: SupabaseClient,
  editionId: string,
): Promise<{ name: string | null; days: string[] }> {
  const { data } = await supabase
    .from("event")
    .select("name, start_date, event_day(day_date)")
    .eq("edition_id", editionId)
    .eq("format_tag", "summit")
    .order("start_date")
    .limit(1)
    .maybeSingle();
  const summit = data as { name: string | null; event_day: { day_date: string }[] | null } | null;
  const tage = [...new Set((summit?.event_day ?? []).map((d) => d.day_date))].sort();
  if (!summit || tage.length === 0) {
    return { name: null, days: await loadEventDays(supabase, editionId) };
  }
  return { name: summit.name, days: tage };
}

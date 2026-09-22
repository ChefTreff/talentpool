import type { SupabaseClient } from "@supabase/supabase-js";
import { zonedTimeToInstant } from "@/lib/tz";

/**
 * Was Side-Event und Interview Tables zum Anlegen brauchen: die **eigenen**
 * Flächen und die Tage, an denen sie bespielt werden können.
 *
 * Beides kommt direkt aus den Tabellen, nicht über eine RPC. `stage` und
 * `event_day` stehen jedem angemeldeten Konto zum Lesen offen (Policy
 * `using (true)` seit 0007) — das Programm ist ohnehin öffentlich, und eine
 * eigene Lesefunktion wäre eine zweite Wahrheit über dieselben Zeilen. Die
 * Einschränkung auf die eigene Organisation macht die `where`-Klausel hier;
 * **die Sperre gegen fremde Flächen sitzt in `partner_create_session`**
 * (42501 `stage_not_yours`), nicht in dieser Abfrage.
 */

export type PartnerStage = {
  id: string;
  name: string;
  type: string;
  event_id: string;
  capacity: number | null;
  default_duration_min: number | null;
};

export type PartnerDay = {
  id: string;
  event_id: string;
  day_date: string;
  label_de: string | null;
  label_en: string | null;
};

export async function ladeFlaechen(
  supabase: SupabaseClient,
  orgId: string,
  typ: "side_event_venue" | "interview_table",
): Promise<{ stages: PartnerStage[]; days: PartnerDay[] }> {
  const { data: stageRows } = await supabase
    .from("stage")
    .select("id, name, type, event_id, capacity, default_duration_min")
    .eq("partner_org_id", orgId)
    .eq("type", typ)
    .eq("active", true)
    .order("name");

  const stages = (stageRows ?? []) as PartnerStage[];
  if (stages.length === 0) return { stages, days: [] };

  const { data: dayRows } = await supabase
    .from("event_day")
    .select("id, event_id, day_date, label_de, label_en")
    .in("event_id", [...new Set(stages.map((s) => s.event_id))])
    .order("day_date");

  return { stages, days: (dayRows ?? []) as PartnerDay[] };
}

/**
 * Aus Tag, Zeitfenster und Länge die einzelnen Gespräche rechnen.
 *
 * Konrad, 17.09.: der Partner legt „Tag, Beginn, Ende, Länge" fest — nicht
 * zwanzig Slots von Hand. Angeschnittene Reste fallen weg: aus 10:00–11:15 bei
 * 30 Minuten werden zwei Gespräche, kein drittes über das Ende hinaus.
 *
 * Die Obergrenze ist kein Geschmack, sondern eine Bremse: jeder Slot ist ein
 * eigener RPC-Aufruf, und ein Tippfehler bei der Länge (5 statt 50) legte
 * sonst hunderte an, die jemand einzeln wieder löschen müsste.
 */
export const MAX_SLOTS = 40;

/** Zeitzone des Summits. Dieselbe Annahme wie im Speaker- und Regie-Bereich. */
export const EVENT_TZ = "Europe/Berlin";

/** „10:30" → 630. Ungültiges gibt `null`, damit der Aufrufer nicht rät. */
function minutenAusUhrzeit(wert: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(wert.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function rechneSlots(
  tag: string,
  von: string,
  bis: string,
  minuten: number,
): { start: Date; end: Date }[] {
  const vonMin = minutenAusUhrzeit(von ?? "");
  const bisMin = minutenAusUhrzeit(bis ?? "");
  if (!tag || vonMin === null || bisMin === null) return [];
  if (!Number.isFinite(minuten) || minuten <= 0) return [];

  // **Nicht `new Date("2027-04-16T10:00")`.** Das liest die Uhrzeit in der Zone
  // des Rechners; ein Partner in London legte seine Gespräche sonst eine Stunde
  // daneben an, ohne dass irgendwo etwas rot würde. `zonedTimeToInstant` rechnet
  // die Wanduhrzeit des Summits um und kommt auch mit der Zeitumstellung klar.
  const start = zonedTimeToInstant(tag, vonMin, EVENT_TZ);
  const ende = zonedTimeToInstant(tag, bisMin, EVENT_TZ);
  if (!(start < ende)) return [];

  const slots: { start: Date; end: Date }[] = [];
  for (let t = start.getTime(); slots.length < MAX_SLOTS; t += minuten * 60_000) {
    const s = new Date(t);
    const e = new Date(t + minuten * 60_000);
    if (e > ende) break;
    slots.push({ start: s, end: e });
  }
  return slots;
}

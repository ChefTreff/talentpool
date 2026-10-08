import type { Eckdatum } from "@/components/ui/Eckdaten";

/** Die Teile von `hack_event_info`, aus denen die Eckdaten entstehen. */
export type EckdatenQuelle = {
  start_date: string | null;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  timezone: string;
  venue: string | null;
  location: string | null;
  note: string | null;
};

const tag = (iso: string) => new Date(`${iso}T12:00:00Z`);
const hhmm = (t: string) => t.slice(0, 5);

/**
 * Wann und wo als Eckdaten (HACK-013). Nichts Erfundenes: fehlt eine Angabe, fehlt die Zeile — fehlt das Datum,
 * gibt es keine Datumszeile, fehlen Ort und Veranstaltungsort, keine Ortszeile. Daten laufen in UTC durch
 * (Kalendertage ohne Zone), damit die Zone des Browsers keinen Tag verschiebt.
 */
export function eckdatenItems(q: EckdatenQuelle | null, dateLocale: string): Eckdatum[] {
  if (!q) return [];
  const out: Eckdatum[] = [];
  if (q.start_date) {
    const start = tag(q.start_date);
    const end = q.end_date && q.end_date !== q.start_date ? tag(q.end_date) : null;
    const lang = new Intl.DateTimeFormat(dateLocale, {
      weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
    });
    const titel = end ? lang.formatRange(start, end) : lang.format(start);
    const zeiten =
      q.start_time && q.end_time ? `${hhmm(q.start_time)}–${hhmm(q.end_time)}` : q.start_time ? hhmm(q.start_time) : null;
    out.push({
      key: "datum",
      art: "datum",
      monat: new Intl.DateTimeFormat(dateLocale, { month: "short", timeZone: "UTC" }).format(start).replace(/\.$/, ""),
      tag: String(start.getUTCDate()),
      titel,
      zusatz: [zeiten, q.note].filter(Boolean).join(" · ") || undefined,
    });
  }
  const ort = q.venue ?? q.location;
  if (ort) {
    out.push({
      key: "ort",
      art: "ort",
      titel: ort,
      zusatz: q.venue && q.location && q.venue !== q.location ? q.location : undefined,
    });
  }
  return out;
}

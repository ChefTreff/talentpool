import type { PortalEvent } from "@/lib/luma/mapping";

/** Der eigene Stand zu einem Event, aus `my_community_registrations()` (registration_status). */
export type EigeneTeilnahme = { luma_event_id: string; status: string };

export function formatEventTime(e: PortalEvent, locale: string): string {
  const fmt = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "de-DE", {
    weekday: "short",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: e.timezone || "Europe/Berlin",
  });
  return fmt.format(new Date(e.startAt));
}

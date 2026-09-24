import "server-only";
import { hasLumaKey, lumaClient } from "./client";
import { toPortalEvent, visibleEvents, type PortalEvent } from "./mapping";

/**
 * Die Events für die Portal-Seite (TAL-007). Ohne Schlüssel oder bei einem
 * Fehler von Luma liefert die Funktion `state` statt einer Ausnahme — die
 * Seite erklärt dann, warum nichts da ist, statt mit 500 abzubrechen.
 */
export async function loadPortalEvents(
  now = new Date(),
): Promise<{ state: "ok"; events: PortalEvent[] } | { state: "no_key" | "error"; events: [] }> {
  if (!hasLumaKey()) return { state: "no_key", events: [] };
  try {
    const all = await lumaClient().listEvents(now);
    return { state: "ok", events: visibleEvents(all, now).map(toPortalEvent) };
  } catch (e) {
    console.error("[luma] Events laden:", e instanceof Error ? e.message : e);
    return { state: "error", events: [] };
  }
}

/**
 * Gehört das Event zu **unserem** Kalender? Die Event-Id kommt aus dem Browser;
 * ohne diese Prüfung ließe sich über unseren Schlüssel jedes öffentliche
 * Luma-Event abfragen und eine Anmeldung dorthin auslösen. Maßgeblich ist
 * `LUMA_CALENDAR_ID`; fehlt sie, gilt nur, was Luma uns als verwaltet meldet.
 */
export function isOurEvent(ev: { calendar_id?: string; access?: string }): boolean {
  const cal = process.env.LUMA_CALENDAR_ID?.trim();
  if (cal) return ev.calendar_id === cal;
  return ev.access === undefined || ev.access === "manage";
}

/** Schreibt die Anmeldung wirklich nach Luma? Erst, wenn Konrad es freischaltet. */
export function lumaWriteEnabled(): boolean {
  return process.env.LUMA_WRITE_ENABLED?.trim() === "true";
}

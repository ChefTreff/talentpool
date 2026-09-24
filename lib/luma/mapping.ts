import type { LumaAddGuests, LumaEvent, LumaGuest } from "./types";

/**
 * Reine Abbildung Luma ⇄ Portal (TAL-007, D12 „Hybrid über die Luma-API").
 * Keine Netzwerkaufrufe, keine Server-Abhängigkeiten — damit laufen die Tests
 * gegen Fixtures, und der Trockenlauf zeigt genau, was geschrieben würde.
 */

/** Was die Events-Seite im Portal von einem Luma-Event zeigt. */
export type PortalEvent = {
  lumaId: string;
  name: string;
  startAt: string;
  endAt: string;
  timezone: string;
  /** Öffentlich teilbarer Link — bleibt die Luma-Seite (Reichweite, Lead-Kanal). */
  shareUrl: string;
  coverUrl: string | null;
  city: string | null;
  registrationOpen: boolean;
  requiresApproval: boolean;
  /** `null` = keine Obergrenze bekannt. */
  spotsRemaining: number | null;
  full: boolean;
  waitlist: boolean;
};

/**
 * Welche Events das Portal zeigt: nur öffentliche und Mitglieder-Events, nie
 * private (die kennt nur, wer eingeladen ist), und nur, was noch nicht vorbei
 * ist. `now` kommt von außen, damit Tests nicht von der Uhr abhängen.
 */
export function visibleEvents(events: LumaEvent[], now: Date): LumaEvent[] {
  return events
    .filter((e) => e.visibility !== "private")
    .filter((e) => new Date(e.end_at).getTime() > now.getTime())
    .sort((a, b) => a.start_at.localeCompare(b.start_at));
}

export function toPortalEvent(e: LumaEvent): PortalEvent {
  const geo = e.geo_address_json ?? null;
  const spots = typeof e.spots_remaining === "number" ? e.spots_remaining : null;
  return {
    lumaId: e.id,
    name: e.name,
    startAt: e.start_at,
    endAt: e.end_at,
    timezone: e.timezone,
    shareUrl: e.url.startsWith("http") ? e.url : `https://luma.com/${e.url}`,
    coverUrl: e.cover_url ?? null,
    city: geo?.city ?? geo?.city_state ?? null,
    registrationOpen: e.registration_open !== false,
    requiresApproval: e.require_approval === true,
    spotsRemaining: spots,
    full: spots !== null && spots <= 0,
    waitlist: e.waitlist_status === "enabled",
  };
}

/** Die Profildaten, die eine Anmeldung aus dem Portal mitschickt (Single Profile). */
export type ProfileForLuma = { email: string; firstName: string | null; lastName: string | null };

/**
 * Anmeldung aus dem Portal: Name und E-Mail kommen aus dem Profil, niemand
 * füllt ein zweites Formular aus. Luma verschickt Bestätigung und Erinnerung
 * selbst (`send_email: true`, D12).
 */
export function toAddGuests(eventId: string, p: ProfileForLuma): LumaAddGuests {
  const email = p.email.trim().toLowerCase();
  if (!email.includes("@")) throw new Error("luma: ungültige E-Mail");
  const name = [p.firstName, p.lastName].map((x) => x?.trim()).filter(Boolean).join(" ") || null;
  return { event_id: eventId, guests: [{ email, name }], send_email: true };
}

/** Was vom Gast zurück ins Profil läuft (Teilnahme-Historie, Segmentierung). */
export type Participation = {
  lumaEventId: string;
  lumaGuestId: string;
  email: string;
  status: "registered" | "pending" | "waitlist" | "declined" | "invited";
  registeredAt: string | null;
  checkedIn: boolean;
};

export function toParticipation(eventId: string, g: LumaGuest): Participation {
  const status: Participation["status"] =
    g.approval_status === "approved" || g.approval_status === "session"
      ? "registered"
      : g.approval_status === "pending_approval"
        ? "pending"
        : g.approval_status === "waitlist"
          ? "waitlist"
          : g.approval_status === "declined"
            ? "declined"
            : "invited";
  return {
    lumaEventId: eventId,
    lumaGuestId: g.id,
    email: g.user_email.trim().toLowerCase(),
    status,
    registeredAt: g.registered_at ?? null,
    checkedIn: (g.event_tickets ?? []).some((t) => Boolean(t.checked_in_at)),
  };
}

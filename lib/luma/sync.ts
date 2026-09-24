import type { LumaEvent, LumaGuest } from "@/lib/luma/types";
import { toParticipation } from "@/lib/luma/mapping";

/**
 * Rücklauf Luma → Profil (TAL-007/008 Stufe 3, D12). Ohne Server-Abhängigkeiten,
 * damit der Test ihn mit Fixtures fährt: Client und Datenbankaufruf kommen von
 * außen. Der Cron `/api/cron/luma-sync` setzt beide ein.
 *
 * Je Event: `luma_sync_event`, dann je Gast `luma_sync_registration`. Beides ist
 * idempotent — ein zweiter Lauf ändert nichts, was schon stimmt. Private Events
 * werden übersprungen (die zeigt das Portal nie), Gäste ohne passende Person
 * zählen als `unmatched` (kein Lead aus Luma, solange das nicht entschieden ist).
 */
export type SyncDeps = {
  listEvents: (after: Date) => Promise<LumaEvent[]>;
  listGuests: (eventId: string) => Promise<LumaGuest[]>;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  /** Nur Events dieses Kalenders abgleichen (`LUMA_CALENDAR_ID`); leer = alle, die der Schlüssel liefert. */
  calendarId?: string | null;
};

export type SyncStats = {
  events: number;
  guests: number;
  matched: number;
  unmatched: number;
  skippedPrivate: number;
  errors: number;
};

/** Wie weit zurück der Abgleich schaut: Check-ins kommen nach dem Event. */
export const SYNC_LOOKBACK_DAYS = 60;

export async function syncLuma(deps: SyncDeps, now = new Date()): Promise<SyncStats> {
  const stats: SyncStats = { events: 0, guests: 0, matched: 0, unmatched: 0, skippedPrivate: 0, errors: 0 };
  const after = new Date(now.getTime() - SYNC_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const events = await deps.listEvents(after);

  for (const ev of events) {
    if (deps.calendarId && ev.calendar_id && ev.calendar_id !== deps.calendarId) continue;
    if (ev.visibility === "private") {
      stats.skippedPrivate++;
      continue;
    }
    const synced = await deps.rpc("luma_sync_event", {
      p_data: {
        luma_id: ev.id,
        name: ev.name,
        start_at: ev.start_at,
        end_at: ev.end_at,
        timezone: ev.timezone,
        city: ev.geo_address_json?.city ?? ev.geo_address_json?.city_state ?? null,
        url: ev.url,
      },
    });
    if (synced.error) {
      stats.errors++;
      continue;
    }
    stats.events++;

    let guests: LumaGuest[];
    try {
      guests = await deps.listGuests(ev.id);
    } catch {
      stats.errors++;
      continue;
    }
    for (const g of guests) {
      stats.guests++;
      const p = toParticipation(ev.id, g);
      const res = await deps.rpc("luma_sync_registration", {
        p_luma_event_id: ev.id,
        p_email: p.email,
        p_guest_id: p.lumaGuestId,
        p_status: p.status,
        p_registered_at: p.registeredAt,
        p_checked_in: p.checkedIn,
      });
      if (res.error) stats.errors++;
      else if ((res.data as { matched?: boolean } | null)?.matched) stats.matched++;
      else stats.unmatched++;
    }
  }
  return stats;
}

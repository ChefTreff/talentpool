/**
 * Luma-API, nur die Felder, die das Portal liest (OpenAPI
 * `https://public-api.luma.com/openapi.json`, gelesen am 24.09.2026).
 * Antworten werden tolerant gelesen: unbekannte Felder bleiben unbeachtet,
 * fehlende optionale Felder sind `undefined`.
 */

export type LumaVisibility = "public" | "members-only" | "private";

export type LumaGeo = {
  address?: string | null;
  city?: string | null;
  city_state?: string | null;
  full_address?: string | null;
} | null;

/** Ein Event aus `GET /v1/calendars/events/list` bzw. `GET /v1/events/get`. */
export type LumaEvent = {
  id: string;
  platform?: string;
  calendar_id?: string;
  name: string;
  start_at: string;
  end_at: string;
  timezone: string;
  /** Die öffentliche Event-Seite — bleibt der teilbare Link (D12). */
  url: string;
  cover_url?: string | null;
  visibility?: LumaVisibility;
  registration_open?: boolean;
  require_approval?: boolean;
  waitlist_status?: "disabled" | "enabled";
  spots_remaining?: number | null;
  geo_address_json?: LumaGeo;
  description_md?: string;
  access?: "manage" | "view" | string;
};

export type LumaApprovalStatus =
  | "approved"
  | "session"
  | "pending_approval"
  | "invited"
  | "declined"
  | "waitlist";

/** Ein Gast aus `GET /v1/events/guests/list` bzw. `…/get`. */
export type LumaGuest = {
  id: string;
  user_email: string;
  user_name?: string | null;
  user_first_name?: string | null;
  user_last_name?: string | null;
  approval_status: LumaApprovalStatus;
  registered_at?: string | null;
  event_tickets?: { checked_in_at?: string | null }[];
};

export type LumaPage<T> = { entries: T[]; has_more: boolean; next_cursor?: string };

/** Body von `POST /v1/events/guests/add`. */
export type LumaAddGuests = {
  event_id: string;
  guests: { email: string; name?: string | null }[];
  approval_status?: "approved" | "pending_approval" | "waitlist" | null;
  send_email?: boolean | null;
};

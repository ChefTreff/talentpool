import type { LumaAddGuests, LumaEvent, LumaGuest, LumaPage } from "./types";

/**
 * Luma-API (TAL-007/008, D12). Basis `https://public-api.luma.com`, Schlüssel im
 * Kopf `x-luma-api-key` (Kalender-Schlüssel, Luma Plus). Kein SDK.
 *
 * **Trockenlauf ist Standard für alles, was schreibt.** `addGuests` schickt nur,
 * wenn der Aufrufer `{ live: true }` setzt; sonst liefert es den Body zurück,
 * der gesendet würde. Lesen ist immer echt — es ändert nichts.
 *
 * Rate-Limit laut Doku: 200 Anfragen pro Minute und Kalender; bei 429 sperrt
 * Luma eine Minute und schickt `Retry-After`. Wiederholt werden nur 429 und 5xx.
 *
 * `fetchImpl` ist einstellbar, damit Tests mit Fixtures laufen, ohne das Netz.
 * Diese Datei ist bewusst ohne `server-only` (wie `lib/vivenu/backoff.ts`), damit
 * `npm test` sie laden kann; der Server-Einstieg ist `lib/luma/client.ts`.
 */
export const LUMA_BASE = "https://public-api.luma.com";
const MAX_ATTEMPTS = 3;

export class LumaError extends Error {
  readonly status: number;
  readonly path: string;
  constructor(status: number, path: string, detail: string) {
    super(`luma ${status} ${path}: ${detail}`);
    this.status = status;
    this.path = path;
  }
}

type Options = {
  apiKey: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

export function createLumaClient(opts: Options) {
  const key = opts.apiKey.trim();
  const doFetch = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    if (!key) throw new Error("LUMA_API_KEY fehlt (docs/zugangs-liste.md)");
    let last: LumaError | null = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const res = await doFetch(`${LUMA_BASE}${path}`, {
        ...init,
        headers: { "x-luma-api-key": key, accept: "application/json", "content-type": "application/json", ...(init?.headers ?? {}) },
        cache: "no-store",
      });
      if (res.ok) return (await res.json()) as T;
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      last = new LumaError(res.status, path.split("?")[0], detail);
      const retry = res.status === 429 || res.status >= 500;
      if (!retry || attempt === MAX_ATTEMPTS - 1) throw last;
      const after = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(after) && after > 0 ? Math.min(after, 60) * 1000 : 1000 * 2 ** attempt);
    }
    throw last ?? new Error("luma: unerreichbar");
  }

  /** Alle Seiten einer Liste; `limit` begrenzt die Seiten, damit kein Lauf ausufert. */
  async function all<T>(path: string, params: URLSearchParams, maxPages = 20): Promise<T[]> {
    const out: T[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < maxPages; page++) {
      const q = new URLSearchParams(params);
      q.set("pagination_limit", "50");
      if (cursor) q.set("pagination_cursor", cursor);
      const res = await call<LumaPage<T>>(`${path}?${q.toString()}`);
      out.push(...res.entries);
      if (!res.has_more || !res.next_cursor) break;
      cursor = res.next_cursor;
    }
    return out;
  }

  return {
    getSelf: () => call<{ user?: { id?: string; name?: string | null } }>("/v1/users/get-self"),

    /** Kommende Events des Kalenders (Standard: ab jetzt, aufsteigend). */
    listEvents: (after: Date = new Date()) =>
      all<LumaEvent>(
        "/v1/calendars/events/list",
        new URLSearchParams({ after: after.toISOString(), sort_column: "start_at", sort_direction: "asc" }),
      ),

    getEvent: (eventId: string) =>
      call<LumaEvent>(`/v1/events/get?${new URLSearchParams({ event_id: eventId }).toString()}`),

    listGuests: (eventId: string) =>
      all<LumaGuest>("/v1/events/guests/list", new URLSearchParams({ event_id: eventId })),

    /** Gast per E-Mail, Gast-Id oder Ticket-Schlüssel (`id` akzeptiert alle drei). */
    getGuest: (eventId: string, idOrEmail: string) =>
      call<LumaGuest>(`/v1/events/guests/get?${new URLSearchParams({ event_id: eventId, id: idOrEmail }).toString()}`),

    /**
     * Gäste anlegen. **Ohne `{ live: true }` nur Trockenlauf** — gibt den Body
     * zurück, statt ihn zu senden.
     */
    async addGuests(body: LumaAddGuests, opts: { live?: boolean } = {}) {
      if (!opts.live) return { dryRun: true as const, body };
      const res = await call<{ skipped?: { email: string }[] }>("/v1/events/guests/add", {
        method: "POST",
        body: JSON.stringify(body),
      });
      return { dryRun: false as const, skipped: res.skipped ?? [] };
    },
  };
}

export type LumaClient = ReturnType<typeof createLumaClient>;

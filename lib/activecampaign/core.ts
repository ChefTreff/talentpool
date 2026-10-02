/**
 * ActiveCampaign-API v3 (TAL-009, K-43). Basis ist die Konto-Adresse
 * (`https://<konto>.api-us1.com`), der Schlüssel steht im Kopf `Api-Token`. Kein SDK.
 *
 * Grenze laut Doku: 5 Anfragen pro Sekunde und Konto — der Client lässt zwischen zwei Anfragen
 * mindestens 220 ms. Wiederholt werden nur 429 und 5xx. `fetchImpl` und `sleep` sind einstellbar,
 * damit Tests ohne Netz und ohne Wartezeit laufen. Ohne `server-only` (wie `lib/luma/core.ts`),
 * damit `npm test` die Datei laden kann; der Server-Einstieg ist `lib/activecampaign/client.ts`.
 */
const MAX_ATTEMPTS = 3;
export const MIN_INTERVAL_MS = 220;

export class AcError extends Error {
  readonly status: number;
  readonly path: string;
  constructor(status: number, path: string, detail: string) {
    super(`activecampaign ${status} ${path}: ${detail}`);
    this.status = status;
    this.path = path;
  }
}

type Options = {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

/** Nur `https://…` ohne Pfad und ohne Zugangsdaten in der Adresse. */
export function normalizeBase(raw: string): string {
  const url = new URL(raw.trim());
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("activecampaign: ungültige API-Adresse");
  return url.origin;
}

export type AcContactRef = { id: string; email: string };

export type AcApi = {
  syncContact(c: { email: string; firstName?: string | null; lastName?: string | null }): Promise<string>;
  ensureTag(name: string): Promise<string>;
  addTag(contactId: string, tagId: string): Promise<void>;
  removeTag(contactId: string, tagId: string): Promise<void>;
  setListStatus(listId: string, contactId: string, status: "subscribed" | "unsubscribed"): Promise<void>;
  deleteContact(contactId: string): Promise<void>;
  listUnsubscribed(since: Date): Promise<AcContactRef[]>;
};

export function createAcClient(opts: Options): AcApi {
  const base = normalizeBase(opts.baseUrl);
  const key = opts.apiKey.trim();
  const doFetch = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const tagIds = new Map<string, string>();
  let lastCall = 0;

  async function call<T>(path: string, init?: RequestInit, okStatus: number[] = []): Promise<T | null> {
    if (!key) throw new Error("ACTIVECAMPAIGN_API_KEY fehlt (docs/zugangs-liste.md)");
    let last: AcError | null = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const wait = lastCall + MIN_INTERVAL_MS - Date.now();
      if (wait > 0) await sleep(wait);
      lastCall = Date.now();
      const res = await doFetch(`${base}${path}`, {
        ...init,
        headers: { "Api-Token": key, accept: "application/json", "content-type": "application/json", ...(init?.headers ?? {}) },
        cache: "no-store",
      });
      if (okStatus.includes(res.status)) return null;
      if (res.ok) return res.status === 204 ? null : ((await res.json().catch(() => null)) as T | null);
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      last = new AcError(res.status, path.split("?")[0], detail);
      const retry = res.status === 429 || res.status >= 500;
      if (!retry || attempt === MAX_ATTEMPTS - 1) throw last;
      const after = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(after) && after > 0 ? Math.min(after, 30) * 1000 : 1000 * 2 ** attempt);
    }
    throw last ?? new Error("activecampaign: unerreichbar");
  }

  const post = (path: string, body: unknown, ok: number[] = []) =>
    call<Record<string, unknown>>(path, { method: "POST", body: JSON.stringify(body) }, ok);

  return {
    async syncContact(c) {
      const res = await post("/api/3/contact/sync", {
        contact: { email: c.email, firstName: c.firstName ?? undefined, lastName: c.lastName ?? undefined },
      });
      const id = (res?.contact as { id?: string | number } | undefined)?.id;
      if (id === undefined || id === null) throw new Error("activecampaign: Kontakt ohne Id");
      return String(id);
    },

    async ensureTag(name) {
      const known = tagIds.get(name);
      if (known) return known;
      const found = await call<{ tags?: { id: string; tag: string }[] }>(`/api/3/tags?${new URLSearchParams({ search: name }).toString()}`);
      const hit = (found?.tags ?? []).find((t) => t.tag === name);
      let id = hit?.id;
      if (!id) {
        const made = await post("/api/3/tags", { tag: { tag: name, tagType: "contact", description: "Portal-Thema (automatisch gepflegt)" } });
        id = (made?.tag as { id?: string | number } | undefined)?.id?.toString();
      }
      if (!id) throw new Error("activecampaign: Tag ohne Id");
      tagIds.set(name, id);
      return id;
    },

    // 422 = der Kontakt trägt das Tag schon.
    async addTag(contactId, tagId) {
      await post("/api/3/contactTags", { contactTag: { contact: contactId, tag: tagId } }, [422]);
    },

    async removeTag(contactId, tagId) {
      const res = await call<{ contactTags?: { id: string; tag: string }[] }>(`/api/3/contacts/${encodeURIComponent(contactId)}/contactTags`, undefined, [404]);
      const ct = (res?.contactTags ?? []).find((x) => String(x.tag) === String(tagId));
      if (ct) await call(`/api/3/contactTags/${encodeURIComponent(ct.id)}`, { method: "DELETE" }, [404]);
    },

    async setListStatus(listId, contactId, status) {
      await post("/api/3/contactLists", { contactList: { list: listId, contact: contactId, status: status === "subscribed" ? 1 : 2 } });
    },

    async deleteContact(contactId) {
      await call(`/api/3/contacts/${encodeURIComponent(contactId)}`, { method: "DELETE" }, [404]);
    },

    // status=2 sind abgemeldete Kontakte; gelesen werden nur die zuletzt geänderten.
    async listUnsubscribed(since) {
      const out: AcContactRef[] = [];
      for (let page = 0; page < 20; page++) {
        const q = new URLSearchParams({ status: "2", limit: "100", offset: String(page * 100), "filters[updated_after]": since.toISOString() });
        const res = await call<{ contacts?: { id: string; email: string }[] }>(`/api/3/contacts?${q.toString()}`);
        const rows = res?.contacts ?? [];
        out.push(...rows.map((c) => ({ id: String(c.id), email: c.email })));
        if (rows.length < 100) break;
      }
      return out;
    },
  };
}

import type { AcApi } from "@/lib/activecampaign/core";

/**
 * Abgleich Portal ⇄ ActiveCampaign (TAL-009, K-43). Ohne Server-Abhängigkeiten, damit der Test ihn
 * mit einem Doppelgänger fährt: Client und Datenbankaufruf kommen von außen. Der Cron
 * `/api/cron/activecampaign-sync` setzt beide ein.
 *
 * Richtung aus: je Person mit Themen ein Kontakt, je Thema das Tag `portal:<schlüssel>`; nicht mehr
 * gewählte Themen verlieren ihr Tag. Wer den Newsletter widerruft, verliert die Tags und wird in
 * der Liste abgemeldet; wer sein Profil löscht oder auf der Sperrliste steht, wird in
 * ActiveCampaign gelöscht. Richtung ein: Abmeldungen, die ActiveCampaign **selbst meldet** (der
 * Client liest sie mit dem Schlüssel aus dem Konto), werden zum Widerruf der Einwilligung. Es gibt
 * keinen offenen Endpunkt, der eine Adresse entgegennimmt.
 */
export type SyncDeps = {
  ac: AcApi;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  /** Liste, in der Kontakte mit Themen stehen; leer = nur Tags. */
  listId?: string | null;
  /** Höchstens so viele Kontakte je Richtung und Lauf. */
  limit?: number;
  /** Wie weit zurück nach Abmeldungen gesucht wird. */
  lookbackDays?: number;
};

export type SyncStats = {
  pushed: number;
  withdrawn: number;
  deleted: number;
  unsubscribedIn: number;
  errors: number;
};

type Outbound = {
  person_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  topics: string[];
  ac_contact_id: string | null;
  previous_topics: string[];
};
type Withdrawn = { person_id: string; email: string | null; ac_contact_id: string; topics: string[]; action: "delete" | "unsubscribe" | "untag" };

/** Das Tag, das ein Thema in ActiveCampaign trägt. Der Schlüssel bleibt stabil, wenn das Team ein Thema umbenennt. */
export function topicTag(key: string): string {
  return `portal:${key}`;
}

export const DEFAULT_LIMIT = 40;
export const DEFAULT_LOOKBACK_DAYS = 3;

export async function syncActiveCampaign(deps: SyncDeps, now = new Date()): Promise<SyncStats> {
  const stats: SyncStats = { pushed: 0, withdrawn: 0, deleted: 0, unsubscribedIn: 0, errors: 0 };
  const limit = deps.limit ?? DEFAULT_LIMIT;
  /** `ok: false` heißt: die Datenbank hat abgelehnt; der Fehler ist schon gezählt. */
  const call = async <T>(fn: string, args: Record<string, unknown>): Promise<{ ok: boolean; data: T | null }> => {
    const res = await deps.rpc(fn, args);
    if (res.error) {
      stats.errors++;
      return { ok: false, data: null };
    }
    return { ok: true, data: res.data as T };
  };

  // 1 · Portal → ActiveCampaign: Kontakte und Themen-Tags.
  const out = (await call<Outbound[]>("ac_sync_outbound", { p_limit: limit })).data ?? [];
  for (const o of out) {
    try {
      const contactId = await deps.ac.syncContact({ email: o.email, firstName: o.first_name, lastName: o.last_name });
      const prev = new Set(o.previous_topics);
      const now_ = new Set(o.topics);
      for (const key of o.topics) {
        if (!prev.has(key) || contactId !== o.ac_contact_id) await deps.ac.addTag(contactId, await deps.ac.ensureTag(topicTag(key)));
      }
      for (const key of o.previous_topics) {
        if (!now_.has(key)) await deps.ac.removeTag(contactId, await deps.ac.ensureTag(topicTag(key)));
      }
      if (deps.listId) await deps.ac.setListStatus(deps.listId, contactId, "subscribed");
      const marked = await call("ac_mark_synced", { p_person_id: o.person_id, p_contact_id: contactId, p_topics: o.topics });
      if (marked.ok) stats.pushed++;
    } catch {
      stats.errors++;
    }
  }

  // 2 · Wer nicht mehr senden darf: Tags weg, abmelden oder löschen.
  const gone = (await call<Withdrawn[]>("ac_sync_withdrawn", { p_limit: limit })).data ?? [];
  for (const w of gone) {
    try {
      if (w.action === "delete") {
        await deps.ac.deleteContact(w.ac_contact_id);
        stats.deleted++;
      } else {
        for (const key of w.topics) await deps.ac.removeTag(w.ac_contact_id, await deps.ac.ensureTag(topicTag(key)));
        if (w.action === "unsubscribe" && deps.listId) await deps.ac.setListStatus(deps.listId, w.ac_contact_id, "unsubscribed");
        stats.withdrawn++;
      }
      if (w.action === "untag") await call("ac_mark_synced", { p_person_id: w.person_id, p_contact_id: w.ac_contact_id, p_topics: [] });
      else await call("ac_mark_removed", { p_person_id: w.person_id });
    } catch {
      stats.errors++;
    }
  }

  // 3 · ActiveCampaign → Portal: Abmeldungen werden zum Widerruf (nur gelesen, nie angenommen).
  try {
    const since = new Date(now.getTime() - (deps.lookbackDays ?? DEFAULT_LOOKBACK_DAYS) * 24 * 60 * 60 * 1000);
    for (const c of await deps.ac.listUnsubscribed(since)) {
      const changed = await call<boolean>("ac_apply_unsubscribe", { p_email: c.email });
      if (changed.data) stats.unsubscribedIn++;
    }
  } catch {
    stats.errors++;
  }
  return stats;
}

import "server-only";
import type { EventAppAdapter, RemoteExhibitor, UpsertOutcome } from "@/lib/event-app/types";
import { SwapcardError, gql } from "@/lib/event-app/swapcard/client";
import { EVENT_QUERY, LIST_EXHIBITORS, UPSERT_EXHIBITORS, DELETE_EXHIBITORS, toSwapcardInput } from "@/lib/event-app/swapcard/queries";
import { chunks } from "@/lib/event-app/mapping";

type Node = { id: string; name: string; description?: string | null; websiteUrl?: string | null; logoUrl?: string | null; clientIds?: string[] | null; type?: string | null };
type Page = { pageInfo: { hasNextPage: boolean; endCursor: string | null }; totalCount: number; nodes: Node[] };
type UpsertData = {
  upsertEventExhibitorsV2: {
    errors: { inputId: string; errorCode: string; message: string; path: string[] }[];
    results: { inputId: string; exhibitor: Node }[];
  } | null;
};

function toRemote(n: Node): RemoteExhibitor {
  return { id: n.id, name: n.name, clientIds: n.clientIds ?? undefined, description: n.description ?? null, websiteUrl: n.websiteUrl ?? null, logoUrl: n.logoUrl ?? null, type: n.type ?? null };
}

const communityCache = new Map<string, string>();

/** Community des Events (Aussteller hängen an der Community, nicht am Event). */
export async function communityOf(eventId: string): Promise<string> {
  const cached = communityCache.get(eventId);
  if (cached) return cached;
  const data = await gql<{ event: { community: { id: string } | null } | null }>("event", EVENT_QUERY, { id: eventId });
  const id = data.event?.community?.id;
  if (!id) throw new SwapcardError(200, "event", `Event ${eventId} nicht gefunden oder ohne Community`);
  communityCache.set(eventId, id);
  return id;
}

/** Swapcard-Implementierung des Adapter-Vertrags. Mutationen kosten 1 000 Punkte (Limit 60 000/Minute), deshalb Upserts in Paketen zu 25. */
export const swapcardAdapter: EventAppAdapter = {
  system: "swapcard",

  async listExhibitors(eventId, scope = "event") {
    const communityId = await communityOf(eventId);
    const out: RemoteExhibitor[] = [];
    let after: string | null = null;
    for (let page = 0; page < 50; page++) {
      const cursor: Record<string, unknown> = after ? { first: 100, after } : { first: 100 };
      const data = await gql<{ exhibitorsV2: Page | null }>("exhibitorsV2", LIST_EXHIBITORS, {
        communityId,
        eventIds: scope === "event" ? [eventId] : null,
        cursor,
      });
      const conn = data.exhibitorsV2;
      if (!conn) break;
      out.push(...conn.nodes.map(toRemote));
      if (!conn.pageInfo.hasNextPage || !conn.pageInfo.endCursor) break;
      after = conn.pageInfo.endCursor;
    }
    return out;
  },

  async upsertExhibitors(eventId, items, opts) {
    const outcome: UpsertOutcome = { results: [], errors: [] };
    for (const part of chunks(items, 25)) {
      const data = await gql<UpsertData>("upsertEventExhibitorsV2", UPSERT_EXHIBITORS, {
        eventId,
        exhibitors: part.map(toSwapcardInput),
        validateOnly: opts?.validateOnly ?? false,
      });
      const res = data.upsertEventExhibitorsV2;
      if (!res) continue;
      outcome.results.push(...res.results.map((r) => ({ inputId: r.inputId, exhibitor: toRemote(r.exhibitor) })));
      outcome.errors.push(...res.errors.map((e) => ({ inputId: e.inputId, code: e.errorCode, message: e.message, path: e.path ?? [] })));
    }
    return outcome;
  },

  async deleteExhibitors(eventId, ids) {
    if (ids.length === 0) return;
    await gql("deleteEventExhibitors", DELETE_EXHIBITORS, { eventId, exhibitorIds: ids });
  },
};

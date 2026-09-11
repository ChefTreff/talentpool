import "server-only";
import type { EventAppAdapter, RemoteExhibitor } from "@/lib/event-app/types";
import { gql } from "@/lib/event-app/swapcard/client";
import { DELETE_EXHIBITORS, LIST_EXHIBITORS, UPSERT_EXHIBITORS, toSwapcardInput } from "@/lib/event-app/swapcard/queries";
import { chunks } from "@/lib/event-app/mapping";

type Node = { id: string; name: string; description?: string | null; websiteUrl?: string | null; logoUrl?: string | null; clientIds?: string[] | null };
type Page = { pageInfo: { endCursor: string | null; hasNextPage: boolean }; totalCount?: number; nodes: Node[] };

function toRemote(n: Node): RemoteExhibitor {
  return { id: n.id, name: n.name, clientIds: n.clientIds ?? undefined, description: n.description ?? null, websiteUrl: n.websiteUrl ?? null, logoUrl: n.logoUrl ?? null };
}

/** Swapcard-Implementierung des Adapter-Vertrags. Mutationen kosten 1 000 Punkte (Limit 60 000/Minute), deshalb Upserts in Paketen zu 25. */
export const swapcardAdapter: EventAppAdapter = {
  system: "swapcard",

  async listExhibitors(eventId) {
    const out: RemoteExhibitor[] = [];
    let after: string | null = null;
    for (let page = 0; page < 50; page++) {
      const cursor: Record<string, unknown> = after ? { first: 100, after } : { first: 100 };
      const data = await gql<{ event: { exhibitors: Page } | null }>("exhibitors", LIST_EXHIBITORS, { eventId, cursor });
      const conn = data.event?.exhibitors;
      if (!conn) break;
      out.push(...conn.nodes.map(toRemote));
      if (!conn.pageInfo.hasNextPage || !conn.pageInfo.endCursor) break;
      after = conn.pageInfo.endCursor;
    }
    return out;
  },

  async upsertExhibitors(eventId, items) {
    const out: RemoteExhibitor[] = [];
    for (const part of chunks(items, 25)) {
      const data = await gql<{ upsertEventExhibitors: Node[] | null }>("upsertEventExhibitors", UPSERT_EXHIBITORS, {
        eventId,
        exhibitors: part.map(toSwapcardInput),
      });
      out.push(...(data.upsertEventExhibitors ?? []).map(toRemote));
    }
    return out;
  },

  async deleteExhibitors(eventId, ids) {
    if (ids.length === 0) return;
    await gql("deleteEventExhibitors", DELETE_EXHIBITORS, { eventId, exhibitorIds: ids });
  },
};

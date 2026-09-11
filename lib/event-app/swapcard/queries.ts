import type { ExhibitorUpsert } from "@/lib/event-app/types";

/**
 * GraphQL-Operationen der Swapcard Content-API (Endpunkt `https://developer.swapcard.com/event-admin/graphql`, Header `Authorization: <API key>`).
 * `upsertEventExhibitors`/`deleteEventExhibitors` und die Felder von `ExhibitorInput` stammen aus den Beispielen auf swapcard.dev; die Event-Abfrage und
 * die Aussteller-Liste je Event sind bis zum Probelauf (`node --env-file=.env.local scripts/swapcard-probe.mjs`) **ungeprüft** — das Skript druckt die
 * echten Namen aus dem Schema, danach werden diese Konstanten angepasst (docs/runbooks/swapcard-aussteller.md).
 */
export const SWAPCARD_GRAPHQL = "https://developer.swapcard.com/event-admin/graphql";

export const EVENT_QUERY = `query PortalEvent($id: ID!) { event(id: $id) { id title beginsAt endsAt } }`;

export const LIST_EXHIBITORS = `query PortalExhibitors($eventId: ID!, $cursor: CursorPaginationInput) {
  event(id: $eventId) {
    exhibitors(cursor: $cursor) { pageInfo { endCursor hasNextPage } totalCount nodes { id name description websiteUrl logoUrl clientIds } }
  }
}`;

export const UPSERT_EXHIBITORS = `mutation PortalUpsertExhibitors($eventId: String!, $exhibitors: [ExhibitorInput!]!) {
  upsertEventExhibitors(eventId: $eventId, exhibitors: $exhibitors) { id name description websiteUrl logoUrl clientIds }
}`;

export const DELETE_EXHIBITORS = `mutation PortalDeleteExhibitors($eventId: String!, $exhibitorIds: [String!]!) {
  deleteEventExhibitors(eventId: $eventId, exhibitorsIds: $exhibitorIds) { id name }
}`;

/** Nur Felder, die `ExhibitorInput` laut Doku kennt; die Standnummer bleibt hier draußen, bis das Schema ein Feld dafür zeigt. */
export type SwapcardExhibitorInput = { clientId: string; name: string; description?: string; websiteUrl?: string; logoUrl?: string; type?: string };

export function toSwapcardInput(item: ExhibitorUpsert): SwapcardExhibitorInput {
  const input: SwapcardExhibitorInput = { clientId: item.clientId, name: item.name };
  if (item.description) input.description = item.description;
  if (item.websiteUrl) input.websiteUrl = item.websiteUrl;
  if (item.logoUrl) input.logoUrl = item.logoUrl;
  if (item.type) input.type = item.type;
  return input;
}

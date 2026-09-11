import type { ExhibitorUpsert } from "@/lib/event-app/types";

/**
 * GraphQL-Operationen der Swapcard Content-API (Endpunkt `https://developer.swapcard.com/event-admin/graphql`, Header `Authorization: <API key>`).
 * Gegen das echte Schema geprüft am 11.09.2026 (Probelauf `scripts/swapcard-probe.mjs`): Aussteller hängen an der **Community** (dort liegen auch die
 * Vorjahre), je Event gefiltert über `exhibitorsV2(filter: {eventIds})`; schreiben über `upsertEventExhibitorsV2` mit `validateOnly` für den
 * Trockenlauf. `ExhibitorInput` kennt u. a. `clientId`, `id`, `name`, `description`, `descriptionTranslations`, `websiteUrl`, `logoUrl`, `type`, `booth`.
 */
export const SWAPCARD_GRAPHQL = "https://developer.swapcard.com/event-admin/graphql";

export const EVENT_QUERY = `query PortalEvent($id: ID!) {
  event(id: $id) { id title beginsAt endsAt totalExhibitors community { id } }
}`;

export const LIST_EXHIBITORS = `query PortalExhibitors($communityId: ID!, $eventIds: [ID!], $cursor: CursorPaginationInput) {
  exhibitorsV2(communityId: $communityId, filter: { eventIds: $eventIds }, cursor: $cursor) {
    pageInfo { hasNextPage endCursor }
    totalCount
    nodes { id name description websiteUrl logoUrl clientIds type }
  }
}`;

export const UPSERT_EXHIBITORS = `mutation PortalUpsertExhibitors($eventId: String!, $exhibitors: [ExhibitorInput!]!, $validateOnly: Boolean) {
  upsertEventExhibitorsV2(eventId: $eventId, exhibitors: $exhibitors, validateOnly: $validateOnly) {
    errors { inputId errorCode message path }
    results { inputId exhibitor { id name description websiteUrl logoUrl clientIds type } }
  }
}`;

export const DELETE_EXHIBITORS = `mutation PortalDeleteExhibitors($eventId: String!, $exhibitorIds: [String!]!) {
  deleteEventExhibitors(eventId: $eventId, exhibitorsIds: $exhibitorIds) { id name }
}`;

/** Sprachen der App (`LanguageEnum`), die wir nutzen. */
export type SwapcardLanguage = "de_DE" | "en_US";

/** Nur geprüfte Felder von `ExhibitorInput`; `type` bleibt draußen, bis geklärt ist, was er 2027 bedeutet (Runbook). */
export type SwapcardExhibitorInput = {
  inputId: string;
  clientId: string;
  id?: string;
  name: string;
  description?: string;
  descriptionTranslations?: { language: SwapcardLanguage; value: string }[];
  websiteUrl?: string;
  logoUrl?: string;
  booth?: string;
};

export function toSwapcardInput(item: ExhibitorUpsert): SwapcardExhibitorInput {
  const input: SwapcardExhibitorInput = { inputId: item.clientId, clientId: item.clientId, name: item.name };
  if (item.existingId) input.id = item.existingId;
  if (item.description) input.description = item.description;
  if (item.descriptionEn) input.descriptionTranslations = [{ language: "en_US", value: item.descriptionEn }];
  if (item.websiteUrl) input.websiteUrl = item.websiteUrl;
  if (item.logoUrl) input.logoUrl = item.logoUrl;
  if (item.booth) input.booth = item.booth;
  return input;
}

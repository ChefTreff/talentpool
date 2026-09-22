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

/**
 * `withEvent(eventId)` liefert, was am **Event** hängt statt am Aussteller — vor allem die Standnummern (Probe 21.09.2026).
 * Für Aussteller, die nur in der Community stehen (Vorjahre), ist es `null`; dann vergleichen wir die Standnummer nicht.
 */
export const LIST_EXHIBITORS = `query PortalExhibitors($communityId: ID!, $eventIds: [ID!], $eventId: ID!, $cursor: CursorPaginationInput) {
  exhibitorsV2(communityId: $communityId, filter: { eventIds: $eventIds }, cursor: $cursor) {
    pageInfo { hasNextPage endCursor }
    totalCount
    nodes { id name description websiteUrl logoUrl clientIds type typeLabel { value } withEvent(eventId: $eventId) { booths { name } } }
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

/** Nur geprüfte Felder von `ExhibitorInput`. `type` ist die Branche (0138) und geht nur mit, wenn der Partner eine angegeben hat. */
export type SwapcardExhibitorInput = {
  inputId: string;
  clientId: string;
  id?: string;
  name: string;
  description?: string;
  descriptionTranslations?: { language: SwapcardLanguage; value: string }[];
  websiteUrl?: string;
  logoUrl?: string;
  /** Die Branche. Heisst drüben `type` — das Sponsoring-Level steht hier ausdrücklich **nicht**. */
  type?: string;
  booth?: string;
};

export function toSwapcardInput(item: ExhibitorUpsert): SwapcardExhibitorInput {
  const input: SwapcardExhibitorInput = { inputId: item.clientId, clientId: item.clientId, name: item.name };
  if (item.existingId) input.id = item.existingId;
  if (item.description) input.description = item.description;
  if (item.descriptionEn) input.descriptionTranslations = [{ language: "en_US", value: item.descriptionEn }];
  if (item.websiteUrl) input.websiteUrl = item.websiteUrl;
  if (item.logoUrl) input.logoUrl = item.logoUrl;
  if (item.industry) input.type = item.industry;
  if (item.booth) input.booth = item.booth;
  return input;
}

/**
 * Personen — Speaker und (später) Teilnehmende.
 *
 * Geprüft am 22.09.2026: `importEventPeople(eventId, data: [ImportEventPersonInput!]!, validateOnly)` legt an **oder** ändert,
 * je `clientId`; anders als beim Ausstellerlauf gibt es hier ein echtes `validateOnly`. Der Pass-Typ steht als `type` und
 * nimmt die Werte aus `event.speakersTypes` (`speaker-pass`, `partner-pass`, `talent-pass`, …). Gruppen (`Speakers`,
 * `Exhibitors`, `Attendees`, `Team`, `Helpdesk`) hängen am Event und werden über `actions.updateGroups` gesetzt.
 *
 * Die Antwort ordnet über `results { inputId eventPerson { id } }` zu; `eventPeopleCreated` und `eventPeopleUpdated` sind
 * **reine Kennungslisten** (`[ID!]!`, keine Objekte) — ob ein Eintrag neu war, steht also daran, ob seine Personen-Kennung
 * in der ersten Liste auftaucht. Das kostete eine Runde: die naheliegende Form mit `clientIds` an den beiden Listen
 * existiert nicht.
 */
export const EVENT_GROUPS = `query PortalEventGroups($id: ID!) {
  event(id: $id) { groups { id name } }
}`;

export const IMPORT_PEOPLE = `mutation PortalImportPeople($eventId: ID!, $data: [ImportEventPersonInput!]!, $validateOnly: Boolean) {
  importEventPeople(eventId: $eventId, data: $data, validateOnly: $validateOnly) {
    errors { inputId errorCode message path expectedValue }
    results { inputId eventPerson { id } }
    eventPeopleCreated
    eventPeopleUpdated
  }
}`;

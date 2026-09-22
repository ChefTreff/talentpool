import "server-only";
import type { EventAppAdapter, RemoteExhibitor, RemoteSponsor, RemoteSponsorCategory, SponsorUpsert, UpsertOutcome } from "@/lib/event-app/types";
import { SwapcardError, gql } from "@/lib/event-app/swapcard/client";
import { EVENT_QUERY, LIST_EXHIBITORS, UPSERT_EXHIBITORS, DELETE_EXHIBITORS, SPONSOR_CATEGORIES, LIST_SPONSORS, CREATE_SPONSOR, UPDATE_SPONSOR, DELETE_SPONSORS, toSwapcardInput, EVENT_GROUPS, IMPORT_PEOPLE } from "@/lib/event-app/swapcard/queries";
import { chunks } from "@/lib/event-app/mapping";

type Node = {
  id: string; name: string; description?: string | null; websiteUrl?: string | null; logoUrl?: string | null;
  clientIds?: string[] | null; type?: string | null; typeLabel?: { value?: string | null } | null;
  withEvent?: { booths?: { name?: string | null }[] | null } | null;
};
type Page = { pageInfo: { hasNextPage: boolean; endCursor: string | null }; totalCount: number; nodes: Node[] };
type UpsertData = {
  upsertEventExhibitorsV2: {
    errors: { inputId: string; errorCode: string; message: string; path: string[] }[];
    results: { inputId: string; exhibitor: Node }[];
  } | null;
};

function toRemote(n: Node): RemoteExhibitor {
  const remote: RemoteExhibitor = {
    id: n.id, name: n.name, clientIds: n.clientIds ?? undefined,
    description: n.description ?? null, websiteUrl: n.websiteUrl ?? null, logoUrl: n.logoUrl ?? null,
    type: n.type ?? null, typeValue: n.typeLabel?.value ?? null,
  };
  // Nur wenn der Aussteller wirklich am Event hängt, kennen wir seine Standnummern. Ein leeres Array heißt „am Event, ohne Stand",
  // `undefined` heißt „wissen wir nicht" — nur der zweite Fall darf den Vergleich überspringen.
  if (n.withEvent) remote.booths = (n.withEvent.booths ?? []).map((b) => b?.name ?? "").filter((b) => b !== "");
  return remote;
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
        eventId,
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

// === Logo-Wand („Sponsoring & Werbung") =====================================

type SponsorNode = { id: string; name?: string | null; logoUrl?: string | null; category?: { id: string; name: string } | null };

/** Die Kategorien der Logo-Wand des Events. */
export async function sponsorCategories(eventId: string): Promise<RemoteSponsorCategory[]> {
  const data = await gql<{ event: { sponsorsCategories: { id: string; name: string }[] } | null }>(
    "sponsorsCategories", SPONSOR_CATEGORIES, { id: eventId },
  );
  return (data.event?.sponsorsCategories ?? []).map((c) => ({ id: c.id, name: c.name }));
}

/** Alles, was auf der Wand steht — auch die Alteinträge aus dem Vorjahr, die keinen Namen tragen. */
export async function listSponsors(eventId: string): Promise<RemoteSponsor[]> {
  const data = await gql<{ sponsors: SponsorNode[] }>("sponsors", LIST_SPONSORS, { eventId });
  return (data.sponsors ?? []).map((s) => ({
    id: s.id,
    name: (s.name ?? "").trim(),
    logoUrl: s.logoUrl ?? null,
    categoryId: s.category?.id ?? null,
    categoryName: s.category?.name ?? null,
  }));
}

/** Anlegen oder ändern. Eine Stapelmutation gibt es nicht, also je Eintrag ein Aufruf (1 000 Punkte). */
export async function upsertSponsor(eventId: string, item: SponsorUpsert): Promise<string> {
  const sponsor: Record<string, unknown> = {
    name: item.name,
    categoryId: item.categoryId,
    logoUrl: item.logoUrl,
    mode: "NORMAL",
  };
  if (item.redirectUrl) sponsor.redirectUrl = item.redirectUrl;
  if (item.existingId) {
    sponsor.id = item.existingId;
    const d = await gql<{ updateEventSponsor: SponsorNode }>("updateEventSponsor", UPDATE_SPONSOR, { eventId, sponsor });
    return d.updateEventSponsor.id;
  }
  const d = await gql<{ createEventSponsor: SponsorNode }>("createEventSponsor", CREATE_SPONSOR, { eventId, sponsor });
  return d.createEventSponsor.id;
}

/**
 * Einträge von der Wand nehmen.
 *
 * **Endgültig.** Swapcard kennt für Sponsoren keinen Papierkorb; anders als bei
 * HubSpot-Produkten gibt es kein Zurückholen. Deshalb ruft das nur die
 * Admin-Route auf, nach Durchsicht der Liste und ausdrücklicher Bestätigung.
 */
export async function deleteSponsors(eventId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  for (let i = 0; i < ids.length; i += 50) {
    await gql("deleteEventSponsors", DELETE_SPONSORS, { eventId, sponsorIds: ids.slice(i, i + 50) });
  }
}

// === Personen (Speaker, spaeter Teilnehmende) ================================

const gruppenCache = new Map<string, string | null>();

/** Die Kennung der Gruppe „Speakers" im Event. Ohne sie geht der Lauf durch, die Person landet nur in keiner Gruppe. */
export async function speakerGroupId(eventId: string): Promise<string | null> {
  if (gruppenCache.has(eventId)) return gruppenCache.get(eventId) ?? null;
  const d = await gql<{ event: { groups: { id: string; name: string }[] } | null }>("groups", EVENT_GROUPS, { id: eventId });
  const treffer = (d.event?.groups ?? []).find((g) => g.name.trim().toLowerCase() === "speakers");
  const id = treffer?.id ?? null;
  gruppenCache.set(eventId, id);
  return id;
}

type ImportAntwort = {
  importEventPeople: {
    errors: { inputId: string; errorCode: string; message: string; path?: string[] | null; expectedValue?: string | null }[];
    results: { inputId: string; eventPerson: { id: string } }[];
    eventPeopleCreated: string[];
    eventPeopleUpdated: string[];
  } | null;
};

/**
 * Personen anlegen oder ändern. `validateOnly` prüft wirklich und schreibt nichts —
 * anders als beim Ausstellerlauf, wo Swapcard nur Fehler zurückgibt.
 *
 * Die Zuordnung Eingabe → Kennung läuft über `results { inputId eventPerson { id } }`.
 * `eventPeopleCreated` und `eventPeopleUpdated` sind **reine Kennungslisten** und
 * tragen unsere Eingabe-Kennung nicht — „war neu" heisst deshalb: die Personen-
 * Kennung steht in der Liste der angelegten. Im Trockenlauf bleiben beide Listen
 * leer, dort gilt der gemerkte Rückverweis.
 */
export async function importSpeakers(
  eventId: string,
  eintraege: Record<string, unknown>[],
  validateOnly: boolean,
): Promise<{
  ids: Map<string, string>;
  updated: Set<string>;
  errors: { inputId: string; code: string; message: string }[];
}> {
  const ids = new Map<string, string>();
  const updated = new Set<string>();
  const errors: { inputId: string; code: string; message: string }[] = [];
  // Paketweise: eine Mutation kostet 1 000 Punkte vom Minutenbudget (60 000).
  for (const teil of chunks(eintraege, 50)) {
    const d = await gql<ImportAntwort>("importEventPeople", IMPORT_PEOPLE, { eventId, data: teil, validateOnly });
    const res = d.importEventPeople;
    if (!res) continue;
    for (const e of res.errors ?? []) {
      errors.push({
        inputId: e.inputId ?? "?",
        code: e.errorCode ?? "?",
        message: `${e.message ?? ""}${e.path?.length ? ` (${e.path.join(".")})` : ""}`,
      });
    }
    const angelegt = new Set(res.eventPeopleCreated ?? []);
    for (const r of res.results ?? []) {
      ids.set(r.inputId, r.eventPerson.id);
      if (!angelegt.has(r.eventPerson.id)) updated.add(r.inputId);
    }
  }
  return { ids, updated, errors };
}
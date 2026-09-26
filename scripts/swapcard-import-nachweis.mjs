/**
 * K-38: der Nachweis, dass der Speaker-Import wirklich ankommt — mit **einer**
 * Wegwerf-Person, die danach drüben wieder gelöscht wird.
 *
 *   node --env-file=.env.local scripts/swapcard-import-nachweis.mjs
 *
 * Konrad hat das am 25.09.2026 freigegeben (K-38). Es wird **nichts** in Masse
 * übertragen: ein einziger Eintrag, gebaut wie der echte Lauf ihn baut, mit
 * einer Plus-Adresse von Konrad selbst — falls Swapcard doch Post verschickt,
 * landet sie in seinem Postfach und bei niemandem sonst.
 *
 * Geprüft wird dabei auch die offene Frage aus K-32: `EventPerson.userId` sagt,
 * ob ein Konto entstanden ist. Ohne Konto gibt es nichts, wozu man einladen
 * könnte.
 *
 * Am Ende steht `deleteEventPeople` — und die Gegenprobe, dass der Eintrag weg
 * ist. Ein Nachweis, der seine Spuren stehen lässt, ist ein Testdatensatz im
 * Livekonto.
 */
const ENDPOINT = "https://developer.swapcard.com/event-admin/graphql";
const key = process.env.SWAPCARD_API_KEY?.trim();
const eventId = process.env.SWAPCARD_EVENT_ID?.trim();
if (!key || !eventId) {
  console.error("SWAPCARD_API_KEY oder SWAPCARD_EVENT_ID fehlt in .env.local");
  process.exit(1);
}

const KENNUNG = "zztest-k38-nachweis";
const ADRESSE = "konrad+zztest-k38@chef-treff.de";

async function gql(query, variables = {}) {
  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: { authorization: key, "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 400));
  return j.data;
}
const maske = (e) => (e ? e.replace(/^(.).*?(@.*)$/, "$1…$2") : "—");

// 1 Gruppe „Speakers" wie im echten Lauf
const g = await gql(`query G($id: ID!) { event(id: $id) { groups { id name } } }`, { id: eventId });
const gruppe = (g.event?.groups ?? []).find((x) => x.name === "Speakers")?.id ?? null;
console.log(`Gruppe „Speakers": ${gruppe ? "gefunden" : "FEHLT"}`);

// 2 Der Eintrag — Feld für Feld wie `lib/event-app/speakers.ts` ihn baut
const felder = {
  firstName: "ZZTEST",
  lastName: "K38-Nachweis",
  jobTitle: "Testeintrag",
  organization: "ChefTreff",
  email: ADRESSE,
  type: "speaker-pass",
  isVisible: true,
};
const eintrag = {
  clientId: KENNUNG,
  inputId: KENNUNG,
  create: { ...felder, isUser: false },
  update: felder,
  actions: gruppe ? { updateGroups: { action: "ADD", groupIds: [gruppe] } } : undefined,
};

const IMPORT = `mutation Nachweis($eventId: ID!, $data: [ImportEventPersonInput!]!) {
  importEventPeople(eventId: $eventId, data: $data, validateOnly: false) {
    errors { inputId errorCode message path }
    results { inputId eventPerson { id } }
    eventPeopleCreated
    eventPeopleUpdated
  }
}`;
const imp = (await gql(IMPORT, { eventId, data: [eintrag] })).importEventPeople;
if (imp.errors?.length) {
  console.log("Beanstandungen:", imp.errors.map((e) => `${e.errorCode} ${e.message}`).join(" | "));
  process.exit(1);
}
const personId = imp.results?.[0]?.eventPerson?.id;
console.log(`Angelegt: ${personId ?? "KEINE KENNUNG"} · created ${imp.eventPeopleCreated?.length ?? 0}, updated ${imp.eventPeopleUpdated?.length ?? 0}`);
if (!personId) process.exit(1);

// 3 Zurücklesen: kam wirklich an, was wir geschickt haben?
//
// Über `search`, nicht über `filters`: `EventPersonFilter` kennt kein Feld
// `field` (am 25.09.2026 am Schema gemessen), die naheliegende Filterform
// weist Swapcard ab.
const LESEN = `query Lesen($eventId: ID!, $q: String!) {
  eventPerson(eventId: $eventId, search: $q) {
    nodes { id userId email firstName lastName jobTitle organization type isVisible clientIds groups { name } }
  }
}`;
const treffer = async () =>
  ((await gql(LESEN, { eventId, q: "K38-Nachweis" })).eventPerson?.nodes ?? []).find((n) => n.id === personId) ?? null;
const drueben = await treffer();
if (drueben) {
  console.log(
    `Zurückgelesen: ${drueben.firstName} ${drueben.lastName} · ${maske(drueben.email)} · Typ ${drueben.type}` +
      ` · Gruppen ${(drueben.groups ?? []).map((x) => x.name).join(",") || "—"}` +
      ` · clientIds ${(drueben.clientIds ?? []).join(",") || "—"} · sichtbar ${drueben.isVisible}`,
  );
  // **Die Antwort auf K-32.** Kein Konto heisst: es gibt nichts, wozu Swapcard
  // einladen könnte.
  console.log(`userId (Konto): ${drueben.userId ?? "null — kein Konto angelegt"}`);
} else {
  console.log("Zurücklesen: kein Treffer (der Eintrag wird trotzdem entfernt)");
}

// 4 Aufräumen — und nachsehen, ob es wirklich weg ist
// `DeleteEventPeopleResult` braucht Unterfelder — ein nacktes
// `deleteEventPeople(...)` weist Swapcard ab. Das kostete beim ersten Lauf die
// Aufräumung: der Eintrag stand noch, bis die Abfrage stimmte.
const LOESCHEN = `mutation Weg($eventId: ID!, $ids: [ID!]!) {
  deleteEventPeople(eventId: $eventId, eventPeopleIds: $ids) { eventPeopleDeleted }
}`;
const weg = await gql(LOESCHEN, { eventId, ids: [personId] });
console.log(`Gelöscht: ${JSON.stringify(weg.deleteEventPeople?.eventPeopleDeleted ?? [])}`);

const rest = await treffer();
console.log(`Gegenprobe: ${rest ? "STEHT NOCH (bitte im Backend entfernen)" : "weg"}`);
const nach = await gql(`query T($id: ID!) { event(id: $id) { totalSpeakers } }`, { id: eventId });
console.log(`Event danach: totalSpeakers ${nach.event?.totalSpeakers}`);

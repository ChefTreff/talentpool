// Swapcard-Probe (Welle 3 A12), nur lesend: prüft den API-Key, druckt die Schema-Ausschnitte, die der Adapter braucht (Query-/Mutation-Namen zu
// Event/Aussteller/Personen/Gruppen, Felder von ExhibitorInput) und den Kopf des Events. Schreibt nichts nach Swapcard.
//   node --env-file=.env.local scripts/swapcard-probe.mjs
// SWAPCARD_API_KEY/SWAPCARD_EVENT_ID sind in Vercel sensibel (env-pull liefert Platzhalter) – Werte lokal in .env.local eintragen, wie beim
// SUPABASE_SECRET_KEY. Die vollständige Schema-Auskunft landet in $TMPDIR/swapcard-schema.json (kein Geheimnis, nur Typnamen).
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ENDPOINT = "https://developer.swapcard.com/event-admin/graphql";
const key = process.env.SWAPCARD_API_KEY?.trim();
const eventId = process.env.SWAPCARD_EVENT_ID?.trim();
if (!key) {
  console.error("SWAPCARD_API_KEY fehlt in .env.local (in Vercel sensibel ⇒ Wert lokal eintragen).");
  process.exit(1);
}

async function gql(query, variables = {}) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { authorization: key, "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* unten */ }
  return { status: res.status, json, text, cost: res.headers.get("x-ratelimit-cost"), remaining: res.headers.get("x-ratelimit-remaining") };
}

function typeName(t) {
  if (!t) return "?";
  if (t.kind === "NON_NULL") return `${typeName(t.ofType)}!`;
  if (t.kind === "LIST") return `[${typeName(t.ofType)}]`;
  return t.name ?? "?";
}
const RELEVANT = /event|exhibitor|people|person|group|planning|member|community|upload|asset/i;

const INTROSPECTION = `query PortalProbe {
  __schema {
    queryType { fields { name args { name type { ...T } } type { ...T } } }
    mutationType { fields { name args { name type { ...T } } type { ...T } } }
  }
  exhibitorInput: __type(name: "ExhibitorInput") { inputFields { name type { ...T } } }
  exhibitor: __type(name: "Exhibitor") { fields { name type { ...T } } }
  event: __type(name: "Event") { fields { name args { name } type { ...T } } }
}
fragment T on __Type { kind name ofType { kind name ofType { kind name ofType { kind name } } } }`;

const intro = await gql(INTROSPECTION);
if (intro.status !== 200 || !intro.json?.data) {
  console.error(`Introspektion fehlgeschlagen: HTTP ${intro.status}`);
  console.error((intro.json?.errors ?? [intro.text.slice(0, 400)]).map((e) => e.message ?? e).join("\n"));
  process.exit(1);
}
const d = intro.json.data;
const out = join(tmpdir(), "swapcard-schema.json");
writeFileSync(out, JSON.stringify(d, null, 2));
console.log(`Key ok (Kosten ${intro.cost ?? "?"}, Rest ${intro.remaining ?? "?"}). Volle Auskunft: ${out}\n`);

const show = (title, fields) => {
  console.log(`## ${title}`);
  for (const f of fields.filter((f) => RELEVANT.test(f.name))) {
    const args = (f.args ?? []).map((a) => `${a.name}: ${typeName(a.type)}`).join(", ");
    console.log(`- ${f.name}(${args}) → ${typeName(f.type)}`);
  }
  console.log("");
};
show("Queries (relevant)", d.__schema.queryType?.fields ?? []);
show("Mutations (relevant)", d.__schema.mutationType?.fields ?? []);
console.log("## ExhibitorInput");
for (const f of d.exhibitorInput?.inputFields ?? []) console.log(`- ${f.name}: ${typeName(f.type)}`);
console.log("\n## Exhibitor (Felder)");
console.log((d.exhibitor?.fields ?? []).map((f) => f.name).join(", ") || "(Typ Exhibitor nicht gefunden)");
console.log("\n## Event (Felder)");
console.log((d.event?.fields ?? []).map((f) => `${f.name}${f.args?.length ? "(…)" : ""}`).join(", ") || "(Typ Event nicht gefunden)");

if (eventId) {
  console.log(`\n## Event ${eventId.slice(0, 4)}…`);
  const ev = await gql(`query PortalEvent($id: ID!) { event(id: $id) { id title beginsAt endsAt totalExhibitors isPublic visibility language community { id } } }`, { id: eventId });
  if (!ev.json?.data?.event) {
    console.log(`kein Treffer – Antwort ${ev.status}: ${(ev.json?.errors ?? []).map((e) => e.message).join("; ") || ev.text.slice(0, 300)}`);
  } else {
    const e = ev.json.data.event;
    console.log(JSON.stringify({ ...e, community: undefined }));
    const cid = e.community?.id;
    if (cid) {
      const list = await gql(`query($c: ID!, $e: [ID!]) { inEvent: exhibitorsV2(communityId: $c, filter: { eventIds: $e }, cursor: { first: 5 }) { totalCount nodes { id name clientIds } } all: exhibitorsV2(communityId: $c, cursor: { first: 1 }) { totalCount } }`, { c: cid, e: [eventId] });
      const d = list.json?.data;
      console.log(`Aussteller im Event: ${d?.inEvent?.totalCount ?? "?"} (Community gesamt: ${d?.all?.totalCount ?? "?"})`);
      for (const n of d?.inEvent?.nodes ?? []) console.log(`- ${n.name} (${n.clientIds?.join(",") || "ohne clientId"})`);
    }
  }
} else {
  console.log("\nSWAPCARD_EVENT_ID fehlt – Event-Abfrage übersprungen.");
}

// Swapcard-Fotoprobe (SPK-047), nur lesend: Auf welchem Host liegen die Personenfotos im Swapcard-Event?
// `static.swapcard.com` heisst, Swapcard hat das Bild beim Import abgeholt und selbst abgelegt — dann reicht die
// signierte Adresse mit sieben Tagen Laufzeit (`PHOTO_URL_TTL_SECONDS` in lib/event-app/logos.ts). Steht dort unsere
// Supabase-Adresse, verlinkt Swapcard nur, und die Bilder verschwinden nach einer Woche — dann braucht der
// Speaker-Lauf einen wöchentlichen Takt. Einmal nach dem ersten Echtlauf mit Porträt fahren.
//   node --env-file=.env.local scripts/swapcard-foto-hosts.mjs
// Gibt keine Namen und keine Adressen aus, nur Zählungen je Pass-Typ und Host. Schreibt nichts nach Swapcard.
const ENDPOINT = "https://developer.swapcard.com/event-admin/graphql";
const key = process.env.SWAPCARD_API_KEY?.trim();
const eventId = process.env.SWAPCARD_EVENT_ID?.trim();
if (!key || !eventId) {
  console.error("SWAPCARD_API_KEY oder SWAPCARD_EVENT_ID fehlt in .env.local (in Vercel sensibel ⇒ Wert lokal eintragen).");
  process.exit(1);
}

const QUERY = `query FotoHosts($eventId: ID!, $cursor: CursorPaginationInput) {
  eventPerson(eventId: $eventId, cursor: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes { photoUrl type }
  }
}`;

const zaehlung = new Map();
let personen = 0;
let after = null;
for (let seite = 0; seite < 50; seite++) {
  const cursor = after ? { first: 100, after } : { first: 100 };
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { authorization: key, "content-type": "application/json" },
    body: JSON.stringify({ query: QUERY, variables: { eventId, cursor } }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.errors) {
    console.error(`Swapcard ${res.status}: ${JSON.stringify(json?.errors ?? json).slice(0, 300)}`);
    process.exit(1);
  }
  const conn = json.data?.eventPerson;
  for (const n of conn?.nodes ?? []) {
    personen += 1;
    let host = "(kein Foto)";
    if (n.photoUrl) {
      try {
        host = new URL(n.photoUrl).host;
      } catch {
        host = "(keine gültige Adresse)";
      }
    }
    const k = `${n.type ?? "?"} · ${host}`;
    zaehlung.set(k, (zaehlung.get(k) ?? 0) + 1);
  }
  if (!conn?.pageInfo?.hasNextPage || !conn.pageInfo.endCursor) break;
  after = conn.pageInfo.endCursor;
}

console.log(`Personen im Event: ${personen}`);
for (const [k, n] of [...zaehlung].sort()) console.log(`  ${k}: ${n}`);
if ([...zaehlung.keys()].some((k) => k.includes("supabase.co"))) {
  console.log("\n!! Fotos zeigen auf unseren Speicher — Swapcard verlinkt nur. Speaker-Lauf wöchentlich takten.");
}

// Luma-Probe (TAL-007, D12), nur lesend: prüft den Schlüssel, zeigt den Kalender und die
// nächsten Events mit Gästezahl. Schreibt nichts nach Luma.
//   node --env-file=.env.local scripts/luma-probe.mjs
// LUMA_API_KEY ist in Vercel sensibel (env-pull liefert einen Platzhalter) — lokal über
// `sh scripts/env-set.sh LUMA_API_KEY` eintragen. LUMA_CALENDAR_ID (kein Geheimnis) prüft,
// dass der Schlüssel zum erwarteten Kalender gehört.
const BASE = "https://public-api.luma.com";
const key = process.env.LUMA_API_KEY?.trim();
const expected = process.env.LUMA_CALENDAR_ID?.trim();
if (!key) {
  console.error("LUMA_API_KEY fehlt in .env.local (sh scripts/env-set.sh LUMA_API_KEY).");
  process.exit(1);
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { "x-luma-api-key": key, accept: "application/json" } });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { /* unten */ }
  if (!res.ok) {
    console.error(`${res.status} ${path.split("?")[0]}: ${text.slice(0, 300)}`);
    process.exit(2);
  }
  return body;
}

const self = await get("/v1/users/get-self");
console.log("Schlüssel ok · Nutzer:", self?.user?.name ?? self?.name ?? "(ohne Namen)");

const cal = await get("/v1/calendars/get");
const calId = cal?.calendar?.id ?? cal?.id ?? cal?.api_id ?? null;
console.log("Kalender:", calId, "·", cal?.calendar?.name ?? cal?.name ?? "");
if (expected && calId && calId !== expected) {
  console.error(`Achtung: erwartet ${expected}, der Schlüssel gehört zu ${calId}.`);
}

const q = new URLSearchParams({ after: new Date().toISOString(), sort_column: "start_at", sort_direction: "asc", pagination_limit: "10" });
const list = await get(`/v1/calendars/events/list?${q}`);
const entries = list?.entries ?? [];
console.log(`Kommende Events: ${entries.length}${list?.has_more ? "+" : ""}`);
for (const e of entries.slice(0, 5)) {
  const guests = await get(`/v1/events/guests/list?${new URLSearchParams({ event_id: e.id, pagination_limit: "50" })}`);
  const n = guests?.entries?.length ?? 0;
  console.log(`- ${e.start_at?.slice(0, 10)} · ${e.name} · ${e.visibility} · ${n}${guests?.has_more ? "+" : ""} Gäste · ${e.url}`);
}
console.log("Nichts geschrieben.");

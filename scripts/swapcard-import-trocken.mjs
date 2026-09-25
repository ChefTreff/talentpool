/**
 * Trockenlauf des Speaker-Imports nach Swapcard (QS-036/EA3), **schreibt nichts**.
 *
 *   node --env-file=.env.local scripts/swapcard-import-trocken.mjs
 *
 * Baut denselben Rumpf wie `lib/event-app/speakers.ts` — Feld für Feld, damit
 * der Lauf etwas über den echten Weg aussagt und nicht über eine Nachbildung —
 * und schickt ihn mit `validateOnly: true`. Swapcard prüft dann nur und legt
 * nichts an; die Antwort enthält in diesem Modus **keine** Kennungen, „keine
 * Fehler" heisst also „alles gültig".
 *
 * Warum ein eigenes Skript und nicht der Knopf im Admin: der verlangt eine
 * Anmeldung. Das Ergebnis gehört nach `docs/schnittstellen-pruefung-2026-09.md`.
 *
 * Gibt keine Schlüssel aus und keine vollständigen Adressen.
 */
import { createClient } from "@supabase/supabase-js";
import { url as supabaseUrl, secretKey, requireEnv } from "./supabase-env.mjs";

requireEnv(true);

const ENDPOINT = "https://developer.swapcard.com/event-admin/graphql";
const key = process.env.SWAPCARD_API_KEY?.trim();
if (!key) { console.error("SWAPCARD_API_KEY fehlt in .env.local"); process.exit(1); }
const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function gql(query, variables = {}) {
  const res = await fetch(ENDPOINT, {
    method: "POST", headers: { authorization: key, "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(`Swapcard: ${JSON.stringify(json.errors).slice(0, 400)}`);
  return json.data;
}

/** Adresse nur andeuten — der Bericht wandert ins Repo. */
const maske = (e) => (e ? e.replace(/^(.).*?(@.*)$/, "$1…$2") : "—");

const { data: rows, error } = await admin.rpc("event_app_speakers", { p_edition_id: null });
if (error) { console.error("event_app_speakers:", error.message); process.exit(1); }
console.log(`Speaker aus dem Export: ${rows.length}`);
if (rows.length === 0) process.exit(0);

const eventId = rows.find((r) => r.swapcard_event_id)?.swapcard_event_id ?? null;
if (!eventId) { console.error("Edition ohne swapcard_event_id"); process.exit(1); }

// Zurückgehalten wie im echten Lauf: Swapcard verlangt Vor- und Nachnamen.
const gehen = [], zurueck = [];
for (const r of rows) {
  if (!(r.first_name ?? "").trim() || !(r.last_name ?? "").trim()) zurueck.push(r);
  else gehen.push(r);
}
console.log(`Gehen mit: ${gehen.length} · zurückgehalten (kein Name): ${zurueck.length}`);
console.log(`Mit Foto: ${gehen.filter((r) => r.has_photo).length} · ohne Foto: ${gehen.filter((r) => !r.has_photo).length}`);

const g = await gql(`query G($id: ID!) { event(id: $id) { groups { id name } } }`, { id: eventId });
const gruppe = (g.event?.groups ?? []).find((x) => x.name === "Speakers")?.id ?? null;
console.log(`Gruppe „Speakers": ${gruppe ? "gefunden" : "FEHLT"}`);

const daten = gehen.map((r) => {
  const felder = {
    firstName: (r.first_name ?? "").trim(),
    lastName: (r.last_name ?? "").trim(),
    jobTitle: r.job_title?.trim() || undefined,
    organization: r.organization?.trim() || undefined,
    biography: r.bio_short_de?.trim() || r.bio_short_en?.trim() || undefined,
    websiteUrl: r.website?.trim() || undefined,
    email: r.email ?? undefined,
    // Kein Foto im Trockenlauf: die öffentliche Kopie entsteht erst im echten Lauf.
    type: "speaker-pass",
    isVisible: true,
  };
  return {
    clientId: r.person_id, inputId: r.person_id,
    create: { ...felder, isUser: false }, update: felder,
    actions: gruppe ? { updateGroups: { action: "ADD", groupIds: [gruppe] } } : undefined,
  };
});

const IMPORT = `mutation Trocken($eventId: ID!, $data: [ImportEventPersonInput!]!, $validateOnly: Boolean) {
  importEventPeople(eventId: $eventId, data: $data, validateOnly: $validateOnly) {
    errors { inputId errorCode message path expectedValue }
    results { inputId eventPerson { id } }
    eventPeopleCreated
    eventPeopleUpdated
  }
}`;
const d = await gql(IMPORT, { eventId, data: daten, validateOnly: true });
const r = d.importEventPeople;
console.log(`\nAntwort: ${r.errors.length} Beanstandung(en), ${r.results?.length ?? 0} Ergebniszeilen, created ${r.eventPeopleCreated?.length ?? 0}, updated ${r.eventPeopleUpdated?.length ?? 0}`);
for (const f of r.errors) {
  const p = gehen.find((x) => x.person_id === f.inputId);
  console.log(`  ✗ ${p ? p.first_name + " " + p.last_name : f.inputId}: ${f.errorCode} ${f.message} (${(f.path ?? []).join(".")})`);
}
if (r.errors.length === 0) console.log("  keine Beanstandung — alle Einträge gültig");
console.log("\nEinträge (Name · Rolle · Firma · Adresse angedeutet · Foto):");
for (const p of gehen) {
  console.log(`  ${p.first_name} ${p.last_name} · ${p.job_title ?? "—"} · ${p.organization ?? "—"} · ${maske(p.email)} · ${p.has_photo ? "Foto" : "ohne Foto"}`);
}
for (const p of zurueck) console.log(`  (zurückgehalten) ${p.first_name ?? ""} ${p.last_name ?? ""} — kein vollständiger Name`);

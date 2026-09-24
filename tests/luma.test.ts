import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { createLumaClient, LumaError } from "@/lib/luma/core";
import { toAddGuests, toParticipation, toPortalEvent, visibleEvents } from "@/lib/luma/mapping";
import type { LumaEvent, LumaGuest } from "@/lib/luma/types";

const fixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/luma/${name}.json`, import.meta.url), "utf8"));

type Call = { url: string; init?: RequestInit };
/** Fetch-Attrappe: beantwortet Aufrufe der Reihe nach und merkt sich jeden. */
function fakeFetch(responses: Response[]) {
  const calls: Call[] = [];
  const impl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const r = responses.shift();
    if (!r) throw new Error("unerwarteter Aufruf " + String(url));
    return r;
  }) as typeof fetch;
  return { impl, calls };
}
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("Luma-Adapter (TAL-007): Client", () => {
  it("schickt den Schlüssel im Kopf und blättert über alle Seiten", async () => {
    const f = fakeFetch([json(fixture("events-list")), json(fixture("events-list-2"))]);
    const c = createLumaClient({ apiKey: " test-key ", fetchImpl: f.impl, sleep: async () => {} });
    const events = await c.listEvents(new Date("2026-09-24T00:00:00Z"));
    assert.equal(events.length, 5);
    assert.equal(f.calls.length, 2);
    assert.match(f.calls[0].url, /^https:\/\/public-api\.luma\.com\/v1\/calendars\/events\/list\?/);
    assert.match(f.calls[0].url, /after=2026-09-24T00%3A00%3A00\.000Z/);
    assert.match(f.calls[1].url, /pagination_cursor=seite-2/);
    const headers = f.calls[0].init?.headers as Record<string, string>;
    assert.equal(headers["x-luma-api-key"], "test-key");
  });

  it("wartet bei 429 auf Retry-After und versucht es erneut", async () => {
    const waits: number[] = [];
    const f = fakeFetch([json({ message: "slow down" }, 429, { "retry-after": "7" }), json(fixture("guests-list"))]);
    const c = createLumaClient({ apiKey: "k", fetchImpl: f.impl, sleep: async (ms) => { waits.push(ms); } });
    const guests = await c.listGuests("evt-oktober");
    assert.equal(guests.length, 3);
    assert.deepEqual(waits, [7000]);
  });

  it("wiederholt 4xx nicht und meldet den Pfad ohne Parameter", async () => {
    const f = fakeFetch([new Response("nope", { status: 401 })]);
    const c = createLumaClient({ apiKey: "k", fetchImpl: f.impl, sleep: async () => {} });
    await assert.rejects(c.getEvent("evt-x"), (e: unknown) => e instanceof LumaError && e.status === 401 && e.path === "/v1/events/get");
    assert.equal(f.calls.length, 1);
  });

  it("schreibt ohne { live: true } nichts (Trockenlauf)", async () => {
    const f = fakeFetch([]);
    const c = createLumaClient({ apiKey: "k", fetchImpl: f.impl });
    const body = toAddGuests("evt-oktober", { email: "Anna@Example.com", firstName: "Anna", lastName: "Beispiel" });
    const res = await c.addGuests(body);
    assert.equal(res.dryRun, true);
    assert.equal(f.calls.length, 0);
  });

  it("schreibt mit { live: true } per POST und liest übersprungene Gäste", async () => {
    const f = fakeFetch([json({ skipped: [{ email: "x@example.com" }] })]);
    const c = createLumaClient({ apiKey: "k", fetchImpl: f.impl });
    const res = await c.addGuests(toAddGuests("evt-oktober", { email: "x@example.com", firstName: null, lastName: null }), { live: true });
    assert.equal(f.calls[0].init?.method, "POST");
    assert.match(f.calls[0].url, /\/v1\/events\/guests\/add$/);
    assert.deepEqual(res, { dryRun: false, skipped: [{ email: "x@example.com" }] });
  });

  it("ohne Schlüssel kein Aufruf", async () => {
    const f = fakeFetch([]);
    const c = createLumaClient({ apiKey: "  ", fetchImpl: f.impl });
    await assert.rejects(c.getSelf(), /LUMA_API_KEY fehlt/);
    assert.equal(f.calls.length, 0);
  });
});

describe("Luma-Adapter (TAL-007): Abbildung", () => {
  const events = fixture("events-list").entries as LumaEvent[];
  const now = new Date("2026-09-24T12:00:00Z");

  it("zeigt nur kommende, nicht private Events, nach Beginn sortiert", () => {
    assert.deepEqual(visibleEvents(events, now).map((e) => e.id), ["evt-oktober", "evt-november"]);
  });

  it("baut den teilbaren Link und erkennt ausgebuchte Events", () => {
    const okt = toPortalEvent(events.find((e) => e.id === "evt-oktober")!);
    assert.equal(okt.shareUrl, "https://luma.com/2erm65d4");
    assert.equal(okt.city, "Hamburg, HH");
    assert.equal(okt.full, true);
    assert.equal(okt.waitlist, true);
    const nov = toPortalEvent(events.find((e) => e.id === "evt-november")!);
    assert.equal(nov.requiresApproval, true);
    assert.equal(nov.spotsRemaining, 12);
    assert.equal(nov.full, false);
  });

  it("meldet mit Profildaten an: E-Mail klein, Name zusammengesetzt, Luma verschickt die Mails", () => {
    assert.deepEqual(toAddGuests("evt-1", { email: " Anna@Example.com ", firstName: "Anna", lastName: " Beispiel" }), {
      event_id: "evt-1",
      guests: [{ email: "anna@example.com", name: "Anna Beispiel" }],
      send_email: true,
    });
    assert.throws(() => toAddGuests("evt-1", { email: "kein-at", firstName: null, lastName: null }));
  });

  it("bildet Gäste auf die Teilnahme im Profil ab", () => {
    const guests = fixture("guests-list").entries as LumaGuest[];
    const p = guests.map((g) => toParticipation("evt-oktober", g));
    assert.deepEqual(p.map((x) => [x.email, x.status, x.checkedIn]), [
      ["anna@example.com", "registered", true],
      ["ben@example.com", "waitlist", false],
      ["cem@example.com", "pending", false],
    ]);
  });
});

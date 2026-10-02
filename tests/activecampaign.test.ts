import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { adminSection } from "@/lib/admin-sections";
import { createAcClient, normalizeBase, type AcApi } from "@/lib/activecampaign/core";
import { syncActiveCampaign, topicTag } from "@/lib/activecampaign/sync";
import { migrationText } from "@/tests/migration-datei";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

/** Ein Doppelgänger von ActiveCampaign, der aufschreibt, was er tun sollte. */
function fakeAc(opts: { unsubscribed?: string[]; failOn?: string } = {}) {
  const calls: string[] = [];
  const ac: AcApi = {
    async syncContact(c) { if (opts.failOn === c.email) throw new Error("boom"); calls.push(`sync:${c.email}`); return `c-${c.email}`; },
    async ensureTag(name) { return `t:${name}`; },
    async addTag(contact, tag) { calls.push(`add:${contact}:${tag}`); },
    async removeTag(contact, tag) { calls.push(`remove:${contact}:${tag}`); },
    async setListStatus(list, contact, status) { calls.push(`list:${list}:${contact}:${status}`); },
    async deleteContact(contact) { calls.push(`delete:${contact}`); },
    async listUnsubscribed() { return (opts.unsubscribed ?? []).map((email, i) => ({ id: String(i), email })); },
  };
  return { ac, calls };
}

function fakeRpc(data: Record<string, unknown>) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  return {
    calls,
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return { data: data[fn] ?? null, error: null };
    },
  };
}

describe("ActiveCampaign-Sync (TAL-009)", () => {
  it("Themen werden Tags, nicht mehr gewählte verlieren ihr Tag, der Stand wird fortgeschrieben", async () => {
    const a = fakeAc();
    const r = fakeRpc({
      ac_sync_outbound: [
        { person_id: "p1", email: "anna@example.com", first_name: "Anna", last_name: "B", topics: ["summit", "hackathon"], ac_contact_id: null, previous_topics: [] },
        { person_id: "p2", email: "ben@example.com", first_name: "Ben", last_name: null, topics: ["summit"], ac_contact_id: "c-ben@example.com", previous_topics: ["summit", "academy"] },
      ],
    });
    const stats = await syncActiveCampaign({ ac: a.ac, rpc: r.rpc, listId: "7" });
    assert.deepEqual(stats, { pushed: 2, withdrawn: 0, deleted: 0, unsubscribedIn: 0, errors: 0 });
    assert.deepEqual(a.calls, [
      "sync:anna@example.com", "add:c-anna@example.com:t:portal:summit", "add:c-anna@example.com:t:portal:hackathon", "list:7:c-anna@example.com:subscribed",
      "sync:ben@example.com", "remove:c-ben@example.com:t:portal:academy", "list:7:c-ben@example.com:subscribed",
    ]);
    const marks = r.calls.filter((c) => c.fn === "ac_mark_synced");
    assert.deepEqual(marks[0].args, { p_person_id: "p1", p_contact_id: "c-anna@example.com", p_topics: ["summit", "hackathon"] });
    assert.equal(topicTag("summit"), "portal:summit");
  });

  it("Rückzug: Löschen nur bei gelöschtem Profil/Sperrliste, Abmelden und Tags entfernen sonst", async () => {
    const a = fakeAc();
    const r = fakeRpc({
      ac_sync_withdrawn: [
        { person_id: "p1", email: null, ac_contact_id: "c1", topics: ["summit"], action: "delete" },
        { person_id: "p2", email: "x@example.com", ac_contact_id: "c2", topics: ["summit", "hackathon"], action: "unsubscribe" },
        { person_id: "p3", email: "y@example.com", ac_contact_id: "c3", topics: ["academy"], action: "untag" },
      ],
    });
    const stats = await syncActiveCampaign({ ac: a.ac, rpc: r.rpc, listId: "7" });
    assert.deepEqual(stats, { pushed: 0, withdrawn: 2, deleted: 1, unsubscribedIn: 0, errors: 0 });
    assert.deepEqual(a.calls, [
      "delete:c1",
      "remove:c2:t:portal:summit", "remove:c2:t:portal:hackathon", "list:7:c2:unsubscribed",
      "remove:c3:t:portal:academy",
    ]);
    assert.deepEqual(r.calls.filter((c) => c.fn === "ac_mark_removed").map((c) => c.args.p_person_id), ["p1", "p2"]);
    const untag = r.calls.find((c) => c.fn === "ac_mark_synced");
    assert.deepEqual(untag?.args, { p_person_id: "p3", p_contact_id: "c3", p_topics: [] });
  });

  it("Abmeldungen aus ActiveCampaign gehen nur gelesen ein und zählen, wenn die Datenbank etwas schrieb", async () => {
    const a = fakeAc({ unsubscribed: ["a@example.com", "b@example.com"] });
    const calls: string[] = [];
    const stats = await syncActiveCampaign({
      ac: a.ac,
      rpc: async (fn, args) => {
        calls.push(`${fn}:${args.p_email ?? ""}`);
        return { data: fn === "ac_apply_unsubscribe" ? args.p_email === "a@example.com" : [], error: null };
      },
    });
    assert.equal(stats.unsubscribedIn, 1);
    assert.deepEqual(calls.filter((c) => c.startsWith("ac_apply")), ["ac_apply_unsubscribe:a@example.com", "ac_apply_unsubscribe:b@example.com"]);
  });

  it("ein Fehler bei einem Kontakt hält den Lauf nicht an und wird gezählt", async () => {
    const a = fakeAc({ failOn: "boom@example.com" });
    const r = fakeRpc({
      ac_sync_outbound: [
        { person_id: "p1", email: "boom@example.com", first_name: null, last_name: null, topics: ["summit"], ac_contact_id: null, previous_topics: [] },
        { person_id: "p2", email: "ok@example.com", first_name: null, last_name: null, topics: ["summit"], ac_contact_id: null, previous_topics: [] },
      ],
    });
    const stats = await syncActiveCampaign({ ac: a.ac, rpc: r.rpc });
    assert.equal(stats.pushed, 1);
    assert.equal(stats.errors, 1);
  });

  it("der Client drosselt auf höchstens fünf Anfragen pro Sekunde und wiederholt nur 429/5xx", async () => {
    const waits: number[] = [];
    let n = 0;
    const client = createAcClient({
      baseUrl: "https://konto.api-us1.com",
      apiKey: "k",
      sleep: async (ms) => { waits.push(ms); },
      fetchImpl: (async () => {
        n++;
        if (n === 1) return new Response("busy", { status: 429, headers: { "retry-after": "1" } });
        return new Response(JSON.stringify({ contact: { id: 5 } }), { status: 200 });
      }) as typeof fetch,
    });
    assert.equal(await client.syncContact({ email: "a@example.com" }), "5");
    assert.equal(n, 2);
    assert.ok(waits.includes(1000));
    await assert.rejects(
      createAcClient({ baseUrl: "https://konto.api-us1.com", apiKey: "k", sleep: async () => {}, fetchImpl: (async () => new Response("no", { status: 401 })) as typeof fetch }).syncContact({ email: "a@example.com" }),
      /401/,
    );
  });

  it("nur https-Adressen ohne Zugangsdaten werden angenommen", () => {
    assert.equal(normalizeBase("https://konto.api-us1.com/"), "https://konto.api-us1.com");
    assert.throws(() => normalizeBase("http://konto.api-us1.com"));
    assert.throws(() => normalizeBase("https://user:pw@konto.api-us1.com"));
  });
});

describe("ActiveCampaign-Sync: Datenbank und Cron", () => {
  const sql = migrationText("v6_activecampaign_sync");

  it("Stand nur für den Server, ohne Adresse in der Tabelle", () => {
    const tabelle = sql.slice(sql.indexOf("create table if not exists ac_contact"), sql.indexOf("comment on table ac_contact"));
    assert.doesNotMatch(tabelle, /email|first_name|last_name/);
    assert.match(sql, /alter table ac_contact enable row level security/);
    assert.match(sql, /revoke all on ac_contact from anon, authenticated/);
  });

  it("alle Sync-Funktionen sind nur für den Dienstschlüssel, der Rückfluss schreibt nur den Widerruf", () => {
    for (const fn of ["ac_sync_outbound", "ac_sync_withdrawn", "ac_mark_synced", "ac_mark_removed", "ac_apply_unsubscribe"]) {
      const start = sql.indexOf(`create or replace function ${fn}(`);
      assert.ok(start > 0, fn);
      assert.match(sql.slice(start, start + 600), /if auth\.uid\(\) is not null then raise exception 'not allowed' using errcode = '42501'/, fn);
      assert.match(sql, new RegExp(`revoke execute on function ${fn}\\([^)]*\\) from public, anon, authenticated`), fn);
    }
    const rueck = sql.slice(sql.indexOf("create or replace function ac_apply_unsubscribe"), sql.indexOf("-- ---------------------------------------------------------------- 3"));
    assert.match(rueck, /'newsletter', v_version, false, 'activecampaign'/);
    assert.doesNotMatch(rueck, /granted\)?\s*values[^;]*true/);
  });

  it("der Cron ruft ActiveCampaign ohne Freigabe nie auf und hat keinen offenen Eingang", () => {
    const route = read("app/api/cron/activecampaign-sync/route.ts");
    const gate = route.indexOf("if (!acWriteEnabled())");
    const client = route.indexOf("acClient()");
    assert.ok(gate > 0 && gate < client, "Trockenlauf vor dem ersten Aufruf an ActiveCampaign");
    assert.match(route, /Verbindung fehlt/);
    assert.match(route, /timingSafeEqual/);
    assert.doesNotMatch(route, /export async function POST/);
    const v = JSON.parse(read("vercel.json"));
    assert.ok(v.crons.some((c: { path: string }) => c.path === "/api/cron/activecampaign-sync"));
  });

  it("der Admin-Status folgt dem Abschnitt notifications", () => {
    assert.match(sql, /has_admin_section\('notifications'\)/);
    assert.ok(adminSection("notifications").roles.length > 0);
    for (const lang of ["de", "en"]) {
      const j = JSON.parse(read(`lib/i18n/${lang}.json`));
      for (const k of ["acWriteOn", "acWriteOff", "acNumbers", "acLast"]) assert.ok(j.adminNotifications[k], `${lang}:${k}`);
    }
  });

  it("Schlüssel und Freigabe stehen in der Zugangsliste und im Beispiel", () => {
    assert.match(read("docs/zugangs-liste.md"), /ACTIVECAMPAIGN_WRITE_ENABLED/);
    assert.match(read(".env.local.example"), /ACTIVECAMPAIGN_WRITE_ENABLED=false/);
  });
});

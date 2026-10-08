import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { provisionAllocations, type VivenuWerkzeug } from "@/lib/vivenu/kontingent-lauf";
import { istUneinheitlich, planeGruppe, type PendingAllocation } from "@/lib/vivenu/kontingent-gruppe";

/**
 * Der Lauf für die Kontingente (PART-111) — **ausgeführt**, nicht gelesen: gegen eine Attrappe von vivenu, die Undershop
 * und Coupons im Speicher hält, und eine Attrappe der Datenbank, die `set_ticket_allocation_vivenu`, die beiden Leser und
 * `org_ticket_allocation` so nachbildet, wie die Funktionen im Snapshot arbeiten. Die Mengengrenze je Kategorie hält in
 * Wirklichkeit vivenu; das belegt die Sandbox-Probe (`kontingent-probe`, 08.10.2026), nicht dieser Test.
 */

type Zeile = {
  id: string;
  org_id: string;
  org_name: string;
  org_slug: string | null;
  event_id: string;
  pass_type: string;
  quantity: number;
  discount_percent: number;
  status: string;
  coupon_code: string | null;
  vivenu_coupon_id: string | null;
  vivenu_undershop_id: string | null;
  undershop_url: string | null;
  synced_at: string | null;
  last_error?: string | null;
};

/** `ticket_type_map` der Edition: investor hat keinen aktiven Tickettyp (wie in Konrads Testorganisation). */
const TYPEN: Record<string, string[]> = {
  partner: ["tt-partner"],
  talent: ["tt-talent", "tt-student"],
  startup: ["tt-startup"],
  investor: [],
};

type Optionen = {
  schluessel?: boolean;
  /** Gibt für einen vivenu-Aufruf einen Fehler zurück, der geworfen wird. */
  fehler?: (aufruf: string) => Error | null;
  /** Gibt für einen Aufruf an die Datenbank eine Fehlermeldung zurück, wie sie `{ error }` trägt. */
  dbFehler?: (name: string, args: Record<string, unknown>) => string | null;
};

function aufbau(vorgabe: Partial<Zeile>[], optionen: Optionen = {}) {
  let zaehler = 0;
  const db: Zeile[] = vorgabe.map((z, i) => ({
    id: `a${i + 1}`,
    org_id: "o1",
    org_name: "Erfolg GmbH",
    org_slug: "erfolg",
    event_id: "ed1",
    pass_type: "partner",
    quantity: 1,
    discount_percent: 100,
    status: "pending_vivenu",
    coupon_code: null,
    vivenu_coupon_id: null,
    vivenu_undershop_id: null,
    undershop_url: null,
    synced_at: null,
    ...z,
  }));
  const audit: { action: string; [k: string]: unknown }[] = [];
  const syncFehler: { id: unknown; message: unknown }[] = [];
  const aufrufe: string[] = [];
  const coupons = new Map<string, Record<string, unknown>>();
  const event: { _id: string; sellStart: string; sellEnd: string; tickets: Record<string, unknown>[]; underShops: Record<string, unknown>[] } = {
    _id: "vev1",
    sellStart: "2026-01-01T00:00:00.000Z",
    sellEnd: "2027-12-31T00:00:00.000Z",
    tickets: [
      { _id: "tt-partner", name: "Partner Pass", price: 80, active: true },
      { _id: "tt-talent", name: "Talent Pass", price: 50, active: true },
      { _id: "tt-student", name: "Student Pass", price: 30, active: true },
      { _id: "tt-startup", name: "Startup Pass", price: 40, active: true },
      { _id: "tt-speaker", name: "Speaker Pass", price: 90, active: true },
    ],
    underShops: [],
  };

  const wirf = (aufruf: string) => {
    aufrufe.push(aufruf);
    const f = optionen.fehler?.(aufruf);
    if (f) throw f;
  };
  const vivenu: VivenuWerkzeug = {
    hasVivenuKey: () => optionen.schluessel !== false,
    async getEvent() {
      wirf("getEvent");
      return structuredClone(event) as never;
    },
    async putUnderShops(_id, shops) {
      wirf("putUnderShops");
      event.underShops = structuredClone(shops).map((s) => ({ ...s, _id: s._id ?? `us${++zaehler}` })) as never;
      return structuredClone(event) as never;
    },
    async createCoupon(input) {
      wirf("createCoupon");
      const c = { ...input, _id: `c${++zaehler}` } as Record<string, unknown>;
      coupons.set(String(c._id), c);
      return { _id: String(c._id), code: String(c.code) };
    },
    async updateCoupon(id, patch) {
      wirf(`updateCoupon:${id}`);
      const alt = coupons.get(id);
      if (!alt) throw Object.assign(new Error(`vivenu 404 /coupon: Coupon ${id} gibt es nicht`), { status: 404, path: "/coupon" });
      // `PUT` ersetzt den Coupon, den Code behält vivenu.
      coupons.set(id, { ...patch, _id: id, code: alt.code } as Record<string, unknown>);
      return { _id: id, code: String(alt.code) };
    },
  };

  const alsLeser = (z: Zeile): PendingAllocation => ({
    id: z.id,
    org_id: z.org_id,
    org_name: z.org_name,
    org_slug: z.org_slug,
    edition_id: z.event_id,
    edition_slug: "fls27",
    vivenu_event_id: "vev1",
    pass_type: z.pass_type,
    quantity: z.quantity,
    discount_percent: z.discount_percent,
    status: z.status,
    coupon_code: z.coupon_code,
    vivenu_coupon_id: z.vivenu_coupon_id,
    vivenu_undershop_id: z.vivenu_undershop_id,
    org_undershop_id: db.find((x) => x.org_id === z.org_id && x.event_id === z.event_id && x.vivenu_undershop_id)?.vivenu_undershop_id ?? null,
    ticket_type_ids: TYPEN[z.pass_type] ?? [],
  });
  const blank = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
  const admin = {
    async rpc(name: string, args: Record<string, unknown>) {
      const dbFehler = optionen.dbFehler?.(name, args);
      if (dbFehler) return { data: null, error: { message: dbFehler } };
      switch (name) {
        case "ticket_allocations_pending":
          return { data: db.filter((z) => z.status === "pending_vivenu" || z.status === "error" || z.synced_at === null).map(alsLeser), error: null };
        case "ticket_allocations_of_orgs":
          return {
            data: db.filter((z) => z.event_id === args.p_event_id && (args.p_org_ids as string[]).includes(z.org_id)).map(alsLeser),
            error: null,
          };
        case "set_ticket_allocation_vivenu": {
          const z = db.find((x) => x.id === args.p_id);
          if (!z) return { data: null, error: { message: "allocation_not_found" } };
          z.status = String(args.p_status);
          z.coupon_code = blank(args.p_coupon_code) ?? z.coupon_code;
          z.vivenu_coupon_id = blank(args.p_vivenu_coupon_id) ?? z.vivenu_coupon_id;
          z.vivenu_undershop_id = blank(args.p_vivenu_undershop_id) ?? z.vivenu_undershop_id;
          z.undershop_url = blank(args.p_undershop_url) ?? z.undershop_url;
          z.last_error = args.p_status === "error" ? String(args.p_error ?? "").slice(0, 500) : null;
          if (args.p_status === "active" || args.p_status === "disabled") z.synced_at = "jetzt";
          audit.push({ action: "ticket.allocation_vivenu", id: z.id, status: args.p_status, coupon_id: args.p_vivenu_coupon_id ?? null });
          return { data: null, error: null };
        }
        case "record_sync_error":
          syncFehler.push({ id: args.p_object_id, message: args.p_message });
          return { data: null, error: null };
        case "log_audit":
          audit.push({ action: String(args.p_action), id: args.p_object_id, before: args.p_before, after: args.p_after });
          return { data: null, error: null };
        default:
          return { data: null, error: { message: `unbekannt: ${name}` } };
      }
    },
    from(tabelle: string) {
      assert.equal(tabelle, "org_ticket_allocation");
      return {
        select: () => ({
          neq: async (spalte: keyof Zeile, wert: string) => ({
            data: db.filter((z) => z[spalte] !== wert).map((z) => ({ org_id: z.org_id, event_id: z.event_id, discount_percent: z.discount_percent, status: z.status, vivenu_coupon_id: z.vivenu_coupon_id })),
            error: null,
          }),
        }),
      };
    },
  } as unknown as SupabaseClient;

  const lauf = (nur?: string) => provisionAllocations(vivenu, admin, 7, nur);
  const zeile = (id: string) => db.find((z) => z.id === id)!;
  const coupon = (id: string) => coupons.get(id)!;
  return { db, audit, syncFehler, aufrufe, coupons, event, vivenu, admin, lauf, zeile, coupon, naechsteId: () => ++zaehler };
}

/** Der Altbestand aus der Zeit je Kategorie: zwei aktive Kontingente, jedes mit eigenem Coupon, alles synchronisiert. */
function altbestand(extra: Partial<Zeile>[] = []) {
  const w = aufbau([
    { pass_type: "partner", quantity: 5, status: "active", coupon_code: "FLS27-ERFOLG-PART-AAAAAA", vivenu_coupon_id: "c-alt-p", vivenu_undershop_id: "us-alt", synced_at: "früher" },
    { pass_type: "talent", quantity: 10, status: "active", coupon_code: "FLS27-ERFOLG-TALE-BBBBBB", vivenu_coupon_id: "c-alt-t", vivenu_undershop_id: "us-alt", synced_at: "früher" },
    ...extra,
  ]);
  const felder = (typen: string[], menge: number) => ({
    discountType: "var", discountValue: 1, allowAllEvents: false, allowedEvents: ["vev1"], allowAllTickets: false, allowedTickets: typen,
    unlocks: [{ target: "underShop", eventId: "vev1", underShopId: "us-alt" }], maxTickets: menge, maxUsage: menge, singleUsage: false, active: true,
  });
  w.coupons.set("c-alt-p", { ...felder(["tt-partner"], 5), name: "FLS27 · Erfolg GmbH · partner", code: "FLS27-ERFOLG-PART-AAAAAA", _id: "c-alt-p" });
  w.coupons.set("c-alt-t", { ...felder(["tt-student", "tt-talent"], 10), name: "FLS27 · Erfolg GmbH · talent", code: "FLS27-ERFOLG-TALE-BBBBBB", _id: "c-alt-t" });
  w.event.underShops.push({ _id: "us-alt", name: "FLS27 · Erfolg GmbH", active: true, unlockMode: "couponCode", tickets: [] });
  return w;
}

/** In jeder Gruppe tragen alle aktiven Zeilen denselben Coupon und denselben Code — das ist der Sinn von PART-111. */
function pruefeEinheitlich(db: Zeile[]) {
  const gruppen = new Map<string, Zeile[]>();
  for (const z of db.filter((x) => x.status === "active")) {
    const k = `${z.org_id}|${z.event_id}|${z.discount_percent}`;
    gruppen.set(k, [...(gruppen.get(k) ?? []), z]);
  }
  for (const [k, zeilen] of gruppen) {
    assert.equal(new Set(zeilen.map((z) => z.vivenu_coupon_id)).size, 1, `Gruppe ${k}: ein Coupon`);
    assert.equal(new Set(zeilen.map((z) => z.coupon_code)).size, 1, `Gruppe ${k}: ein Code`);
  }
}

describe("Kontingent-Lauf: eine neue Gruppe bekommt einen Coupon (PART-111)", () => {
  it("zwei Kategorien, ein Coupon: Vereinigung der Tickettypen, Summe der Mengen, Freischaltung des Shops, derselbe Code an beiden Zeilen", async () => {
    const w = aufbau([{ pass_type: "partner", quantity: 5 }, { pass_type: "talent", quantity: 10 }]);
    const s = await w.lauf();
    assert.equal(w.coupons.size, 1);
    const [c] = [...w.coupons.values()];
    assert.deepEqual(c.allowedTickets, ["tt-partner", "tt-student", "tt-talent"]);
    assert.equal(c.maxTickets, 15);
    assert.equal(c.maxUsage, 15);
    assert.equal(c.discountType, "var");
    assert.equal(c.discountValue, 1);
    assert.equal(c.allowAllEvents, false);
    assert.equal(c.allowAllTickets, false);
    assert.deepEqual(c.allowedEvents, ["vev1"]);
    assert.equal(c.active, true);
    assert.equal(c.name, "FLS27 · Erfolg GmbH");
    const shop = w.event.underShops[0];
    assert.deepEqual(c.unlocks, [{ target: "underShop", eventId: "vev1", underShopId: shop._id }]);
    // Der Code nennt die Kategorie nicht mehr.
    assert.match(String(c.code), /^FLS27-ERFOLG-[0-9A-F]{6}$/);
    for (const id of ["a1", "a2"]) {
      const z = w.zeile(id);
      assert.equal(z.status, "active");
      assert.equal(z.coupon_code, c.code);
      assert.equal(z.vivenu_coupon_id, c._id);
      assert.equal(z.vivenu_undershop_id, shop._id);
      assert.ok(z.undershop_url === null || typeof z.undershop_url === "string");
    }
    pruefeEinheitlich(w.db);
    assert.equal(s.created, 1, "ein Coupon, nicht zwei");
    assert.equal(s.errors, 0);
    assert.equal(s.retired, 0);
  });

  it("der Undershop trägt die Menge je Tickettyp: Summe je Typ, fremde Typen geschlossen", async () => {
    const w = aufbau([{ pass_type: "partner", quantity: 5 }, { pass_type: "talent", quantity: 10 }]);
    await w.lauf();
    const shop = w.event.underShops[0] as { unlockMode: string; maxAmount: number; maxAmountPerOrder: number; tickets: { baseTicket: string; amount: number; active: boolean; price: number }[] };
    assert.equal(shop.unlockMode, "couponCode");
    assert.equal(shop.maxAmount, 5 + 10 + 10);
    const je = Object.fromEntries(shop.tickets.map((t) => [t.baseTicket, t]));
    assert.deepEqual([je["tt-partner"].amount, je["tt-talent"].amount, je["tt-student"].amount], [5, 10, 10]);
    assert.equal(je["tt-speaker"].active, false, "der Speaker Pass bleibt zu");
    assert.equal(je["tt-startup"].active, false);
    assert.equal(je["tt-partner"].price, 0);
  });

  it("ein zweiter Lauf direkt danach tut nichts (idempotent)", async () => {
    const w = aufbau([{ pass_type: "partner", quantity: 5 }, { pass_type: "talent", quantity: 10 }]);
    await w.lauf();
    const nachErstem = w.aufrufe.length;
    const auditVorher = w.audit.length;
    const s = await w.lauf();
    assert.equal(w.aufrufe.length, nachErstem, "kein vivenu-Aufruf");
    assert.equal(w.audit.length, auditVorher, "kein weiterer Audit-Eintrag");
    assert.deepEqual([s.pending, s.created, s.updated, s.merged, s.retired, s.errors], [0, 0, 0, 0, 0, 0]);
  });

  it("ohne Schlüssel ein Trockenlauf: nichts geschieht", async () => {
    const w = aufbau([{ pass_type: "partner", quantity: 5 }], { schluessel: false });
    const s = await w.lauf();
    assert.match(s.skipped ?? "", /VIVENU_API_KEY fehlt/);
    assert.equal(w.aufrufe.length, 0);
    assert.equal(w.zeile("a1").status, "pending_vivenu");
  });
});

describe("Kontingent-Lauf: Änderungen an einer bestehenden Gruppe", () => {
  async function fertig() {
    const w = aufbau([{ pass_type: "partner", quantity: 5 }, { pass_type: "talent", quantity: 10 }]);
    await w.lauf();
    return w;
  }

  it("eine geänderte Menge erweitert denselben Coupon — Code und Coupon-Id bleiben", async () => {
    const w = await fertig();
    const [id, vorher] = [...w.coupons.entries()][0];
    // `sync_ticket_allocations` ändert die Menge und setzt `synced_at` zurück.
    Object.assign(w.zeile("a2"), { quantity: 12, synced_at: null });
    const s = await w.lauf();
    assert.equal(w.coupons.size, 1);
    assert.equal(w.coupon(id).maxTickets, 17);
    assert.equal(w.coupon(id).code, vorher.code);
    assert.equal(w.zeile("a1").coupon_code, vorher.code);
    assert.equal(w.zeile("a2").coupon_code, vorher.code);
    assert.deepEqual([s.created, s.updated, s.merged, s.retired], [0, 1, 0, 0]);
    pruefeEinheitlich(w.db);
  });

  it("eine später gebuchte Kategorie kommt unter denselben Code — es entsteht kein neuer Coupon", async () => {
    const w = await fertig();
    const [id, vorher] = [...w.coupons.entries()][0];
    w.db.push({ id: "a3", org_id: "o1", org_name: "Erfolg GmbH", org_slug: "erfolg", event_id: "ed1", pass_type: "startup", quantity: 3, discount_percent: 100, status: "pending_vivenu", coupon_code: null, vivenu_coupon_id: null, vivenu_undershop_id: null, undershop_url: null, synced_at: null });
    await w.lauf();
    assert.equal(w.coupons.size, 1);
    assert.deepEqual(w.coupon(id).allowedTickets, ["tt-partner", "tt-startup", "tt-student", "tt-talent"]);
    assert.equal(w.coupon(id).maxTickets, 18);
    assert.equal(w.zeile("a3").coupon_code, vorher.code);
    assert.equal(w.zeile("a3").vivenu_coupon_id, id);
    pruefeEinheitlich(w.db);
  });

  it("eine Kategorie fällt weg: der Coupon deckt nur noch die übrigen, der Code bleibt", async () => {
    const w = await fertig();
    const [id, vorher] = [...w.coupons.entries()][0];
    Object.assign(w.zeile("a2"), { status: "disabled", quantity: 0, synced_at: null });
    await w.lauf();
    assert.deepEqual(w.coupon(id).allowedTickets, ["tt-partner"]);
    assert.equal(w.coupon(id).maxTickets, 5);
    assert.equal(w.coupon(id).active, true);
    assert.equal(w.zeile("a1").coupon_code, vorher.code);
    assert.equal(w.zeile("a2").status, "disabled");
    assert.equal(w.zeile("a2").synced_at, "jetzt");
  });

  it("fällt die letzte Kategorie weg, wird der Coupon mit vollem Satz zugedreht — und wäre wieder einzuschalten", async () => {
    const w = await fertig();
    const [id] = [...w.coupons.keys()];
    for (const z of ["a1", "a2"]) Object.assign(w.zeile(z), { status: "disabled", quantity: 0, synced_at: null });
    const s = await w.lauf();
    const c = w.coupon(id);
    assert.deepEqual([c.active, c.maxTickets, c.maxUsage], [false, 0, 0]);
    assert.ok(c.name, "PUT ersetzt, der Name ist Pflicht");
    assert.equal(c.allowAllEvents, false);
    assert.equal(c.allowAllTickets, false);
    assert.equal(s.disabled, 2);
    // Wird danach wieder eine Kategorie gebucht, lebt derselbe Coupon wieder auf.
    Object.assign(w.zeile("a1"), { status: "pending_vivenu", quantity: 4, synced_at: null });
    await w.lauf();
    assert.equal(w.coupons.size, 1);
    assert.deepEqual([w.coupon(id).active, w.coupon(id).maxTickets], [true, 4]);
  });

  it("eine Kategorie ohne Tickettyp wird fehlerhaft, die übrigen laufen weiter", async () => {
    const w = aufbau([{ pass_type: "partner", quantity: 5 }, { pass_type: "talent", quantity: 10 }, { pass_type: "investor", quantity: 2 }]);
    const s = await w.lauf();
    assert.equal(w.coupons.size, 1);
    assert.deepEqual([...w.coupons.values()][0].allowedTickets, ["tt-partner", "tt-student", "tt-talent"]);
    assert.equal(w.zeile("a1").status, "active");
    assert.equal(w.zeile("a2").status, "active");
    assert.equal(w.zeile("a3").status, "error");
    assert.match(w.zeile("a3").last_error ?? "", /keine Tickettypen für Pass-Typ investor in ticket_type_map/);
    assert.equal(s.errors, 1);
    assert.equal(w.syncFehler.length, 1);
  });
});

describe("Kontingent-Lauf: der Altbestand aus der Zeit je Kategorie wird auf einen Coupon gebracht", () => {
  it("der erste Coupon bleibt und wird erweitert, die übrigen werden abgeschaltet, alle Zeilen tragen den Code des bleibenden", async () => {
    const w = altbestand();
    const s = await w.lauf();
    // Bleibender Coupon: der der ersten Kategorie in der Reihenfolge — partner.
    const bleibt = w.coupon("c-alt-p");
    assert.deepEqual(bleibt.allowedTickets, ["tt-partner", "tt-student", "tt-talent"]);
    assert.equal(bleibt.maxTickets, 15);
    assert.equal(bleibt.active, true);
    assert.equal(bleibt.code, "FLS27-ERFOLG-PART-AAAAAA", "ein schon ausgegebener Code ändert sich nicht");
    // Abgelöster Coupon: zu, mit Grenzen 0 und dem vollen Satz, gut zu erkennen.
    const weg = w.coupon("c-alt-t");
    assert.deepEqual([weg.active, weg.maxTickets, weg.maxUsage], [false, 0, 0]);
    assert.match(String(weg.name), /ersetzt$/);
    assert.deepEqual(weg.allowedTickets, ["tt-talent", "tt-student"]);
    // Beide Zeilen tragen den bleibenden Code.
    for (const id of ["a1", "a2"]) {
      assert.equal(w.zeile(id).coupon_code, "FLS27-ERFOLG-PART-AAAAAA");
      assert.equal(w.zeile(id).vivenu_coupon_id, "c-alt-p");
    }
    pruefeEinheitlich(w.db);
    assert.deepEqual([s.pending, s.created, s.updated, s.merged, s.retired, s.errors], [0, 0, 1, 1, 1, 0]);
    // Audit je Änderung: die Ablösung steht mit alter und neuer Coupon-Id da, ohne Personendaten.
    const ablosung = w.audit.filter((a) => a.action === "ticket.coupon_retired");
    assert.equal(ablosung.length, 1);
    assert.deepEqual(ablosung[0].before, { coupon_id: "c-alt-t", pass_type: "talent" });
    assert.deepEqual(ablosung[0].after, { merged_into: "c-alt-p", discount_percent: 100 });
    assert.doesNotMatch(JSON.stringify(w.audit), /@/);
  });

  it("danach ist alles still: der nächste Lauf macht nichts", async () => {
    const w = altbestand();
    await w.lauf();
    const aufrufe = w.aufrufe.length;
    const audit = w.audit.length;
    const s = await w.lauf();
    assert.equal(w.aufrufe.length, aufrufe);
    assert.equal(w.audit.length, audit);
    assert.deepEqual([s.created, s.updated, s.merged, s.retired], [0, 0, 0, 0]);
  });

  it("Konrads Testorganisation: partner, talent und investor ohne Tickettyp — der Fehler bleibt an der Zeile, der Rest wird zusammengeführt", async () => {
    const w = altbestand([{ pass_type: "investor", quantity: 5, status: "error", coupon_code: null, vivenu_coupon_id: null, synced_at: null }]);
    const s = await w.lauf();
    assert.equal(w.zeile("a3").status, "error");
    assert.equal(w.zeile("a1").coupon_code, w.zeile("a2").coupon_code);
    assert.equal(s.retired, 1);
    assert.equal(s.errors, 1);
    pruefeEinheitlich(w.db);
  });

  it("scheitert das Abschalten eines alten Coupons, bleiben die Zeilen aktiv und der Fehler wird gemeldet — der nächste Lauf holt es nach", async () => {
    let kaputt = true;
    const w = altbestand();
    // Neu aufbauen mit Fehler: die Optionen sind beim Aufbau gesetzt, also hier der Umweg über eine veränderliche Bedingung.
    const mitFehler = aufbau([], { fehler: (a) => (kaputt && a === "updateCoupon:c-alt-t" ? Object.assign(new Error("vivenu 500 /coupon: kaputt"), { status: 500, path: "/coupon" }) : null) });
    mitFehler.db.push(...w.db);
    for (const [k, v] of w.coupons) mitFehler.coupons.set(k, v);
    mitFehler.event.underShops.push(...w.event.underShops);
    const s = await mitFehler.lauf();
    assert.equal(s.errors, 1);
    assert.equal(mitFehler.syncFehler.length, 1);
    // Der bleibende Coupon wurde schon erweitert, die Zeilen haben aber noch ihre alten Werte und gelten weiter.
    assert.equal(mitFehler.coupon("c-alt-p").maxTickets, 15);
    assert.equal(mitFehler.zeile("a1").status, "active");
    assert.equal(mitFehler.zeile("a2").status, "active");
    assert.equal(mitFehler.zeile("a2").vivenu_coupon_id, "c-alt-t");
    assert.equal(mitFehler.coupon("c-alt-t").active, true, "der alte Coupon läuft noch — niemand steht ohne Code da");
    // Nächster Lauf ohne Fehler: alles zusammengeführt.
    kaputt = false;
    const nachher = await mitFehler.lauf();
    assert.equal(nachher.errors, 0);
    assert.equal(mitFehler.coupon("c-alt-t").active, false);
    assert.equal(mitFehler.zeile("a2").vivenu_coupon_id, "c-alt-p");
    pruefeEinheitlich(mitFehler.db);
  });

  it("bei `?allocation=<id>` wird nur die Gruppe dieser Zeile bearbeitet, nie eine fremde mit mehreren Coupons", async () => {
    const w = altbestand();
    w.db.push({ id: "a9", org_id: "o2", org_name: "Andere AG", org_slug: "andere", event_id: "ed1", pass_type: "partner", quantity: 2, discount_percent: 100, status: "pending_vivenu", coupon_code: null, vivenu_coupon_id: null, vivenu_undershop_id: null, undershop_url: null, synced_at: null });
    await w.lauf("a9");
    assert.equal(w.zeile("a9").status, "active");
    // Der Altbestand der anderen Organisation blieb unberührt.
    assert.equal(w.coupon("c-alt-t").active, true);
    assert.equal(w.zeile("a2").vivenu_coupon_id, "c-alt-t");
  });
});

describe("Kontingent-Lauf: Rabattstufen und Fehler", () => {
  it("50 % ist eine eigene Gruppe mit eigenem Code und halbem Rabatt", async () => {
    const w = aufbau([
      { pass_type: "partner", quantity: 4 },
      { pass_type: "talent", quantity: 6 },
      { pass_type: "partner", quantity: 2, discount_percent: 50 },
    ]);
    await w.lauf();
    assert.equal(w.coupons.size, 2);
    const hundert = w.coupon(String(w.zeile("a1").vivenu_coupon_id));
    const fuenfzig = w.coupon(String(w.zeile("a3").vivenu_coupon_id));
    assert.equal(w.zeile("a1").vivenu_coupon_id, w.zeile("a2").vivenu_coupon_id);
    assert.notEqual(w.zeile("a1").vivenu_coupon_id, w.zeile("a3").vivenu_coupon_id);
    assert.equal(hundert.discountValue, 1);
    assert.equal(fuenfzig.discountValue, 0.5);
    assert.match(String(hundert.code), /^FLS27-ERFOLG-[0-9A-F]{6}$/);
    assert.match(String(fuenfzig.code), /^FLS27-ERFOLG-50-[0-9A-F]{6}$/);
    assert.equal(fuenfzig.maxTickets, 2);
    assert.match(String(fuenfzig.name), /50%$/);
    pruefeEinheitlich(w.db);
  });

  it("scheitert das Anlegen des Coupons, werden die ausstehenden Zeilen fehlerhaft und der nächste Lauf legt ihn an", async () => {
    let kaputt = true;
    const w = aufbau([{ pass_type: "partner", quantity: 5 }, { pass_type: "talent", quantity: 10 }], {
      fehler: (a) => (kaputt && a === "createCoupon" ? Object.assign(new Error("vivenu 400 /coupon: abgelehnt"), { status: 400, path: "/coupon" }) : null),
    });
    const s = await w.lauf();
    assert.equal(s.errors, 2);
    assert.deepEqual([w.zeile("a1").status, w.zeile("a2").status], ["error", "error"]);
    assert.equal(w.coupons.size, 0);
    kaputt = false;
    const nachher = await w.lauf();
    assert.equal(nachher.errors, 0);
    assert.deepEqual([w.zeile("a1").status, w.zeile("a2").status], ["active", "active"]);
    assert.equal(w.coupons.size, 1);
  });

  it("scheitert das Schreiben einer Zeile in die Datenbank, geht der Fehler nicht unter — der nächste Lauf nimmt den vorhandenen Coupon, es entsteht kein zweiter", async () => {
    let kaputt = true;
    const w = aufbau([{ pass_type: "partner", quantity: 5 }, { pass_type: "talent", quantity: 10 }], {
      dbFehler: (name, args) => (kaputt && name === "set_ticket_allocation_vivenu" && args.p_id === "a2" && args.p_status === "active" ? "Datenbank nicht erreichbar" : null),
    });
    const s = await w.lauf();
    assert.ok(s.errors >= 1);
    assert.match(w.syncFehler.map((f) => String(f.message)).join(" "), /Datenbank nicht erreichbar/);
    assert.equal(w.coupons.size, 1);
    assert.notEqual(w.zeile("a2").status, "active");
    kaputt = false;
    const nachher = await w.lauf();
    assert.equal(nachher.errors, 0);
    assert.equal(w.coupons.size, 1, "derselbe Coupon, kein zweiter");
    assert.deepEqual([w.zeile("a1").status, w.zeile("a2").status], ["active", "active"]);
    pruefeEinheitlich(w.db);
  });

  it("eine Gruppe ohne Arbeit bleibt unberührt, auch wenn eine andere Stufe derselben Organisation ansteht", async () => {
    // 100 % ist fertig und gleich; nur die 50-%-Zeile steht aus. Der Coupon der 100er-Gruppe darf nicht angefasst werden —
    // im Gesamtlauf nicht und bei `?allocation=<id>` auch nicht.
    const szenario = () => {
      const w = aufbau([
        { pass_type: "partner", quantity: 4, status: "active", coupon_code: "FLS27-ERFOLG-X", vivenu_coupon_id: "c-x", vivenu_undershop_id: "us-x", synced_at: "früher" },
        { pass_type: "partner", quantity: 2, discount_percent: 50 },
      ]);
      w.coupons.set("c-x", { _id: "c-x", code: "FLS27-ERFOLG-X", name: "alt", maxTickets: 4, active: true });
      w.event.underShops.push({ _id: "us-x", name: "FLS27 · Erfolg GmbH", active: true, unlockMode: "couponCode", tickets: [] });
      return w;
    };
    for (const nur of [undefined, "a2"]) {
      const w = szenario();
      await w.lauf(nur);
      assert.equal(w.aufrufe.includes("updateCoupon:c-x"), false, `der Coupon der fertigen Gruppe wurde nicht angefasst (nur=${nur})`);
      assert.equal(w.zeile("a1").vivenu_coupon_id, "c-x");
      assert.equal(w.zeile("a2").status, "active");
      assert.notEqual(w.zeile("a2").vivenu_coupon_id, "c-x");
    }
  });

  it("scheitert vivenu schon beim Lesen des Events, werden die ausstehenden Zeilen fehlerhaft — es entsteht nichts", async () => {
    const w = aufbau([{ pass_type: "partner", quantity: 5 }], { fehler: (a) => (a === "getEvent" ? new Error("vivenu 502 /events: Bad Gateway") : null) });
    const s = await w.lauf();
    assert.equal(s.errors, 1);
    assert.equal(w.zeile("a1").status, "error");
    assert.equal(w.coupons.size, 0);
  });
});

describe("Kontingent-Gruppe: Planung und Erkennung", () => {
  const z = (extra: Partial<PendingAllocation>): PendingAllocation => ({
    id: "x", org_id: "o", org_name: "O", org_slug: "o", edition_id: "e", edition_slug: "fls27", vivenu_event_id: "v", pass_type: "partner", quantity: 1,
    discount_percent: 100, status: "active", coupon_code: null, vivenu_coupon_id: null, vivenu_undershop_id: null, org_undershop_id: null, ticket_type_ids: ["t"], ...extra,
  });

  it("der bleibende Coupon: aktive vor ausstehenden, innerhalb davon nach Kategorie — unabhängig von der Reihenfolge der Abfrage", () => {
    const a = z({ id: "1", pass_type: "talent", vivenu_coupon_id: "c-t", coupon_code: "T" });
    const b = z({ id: "2", pass_type: "partner", vivenu_coupon_id: "c-p", coupon_code: "P" });
    const c = z({ id: "3", pass_type: "startup", status: "error", vivenu_coupon_id: "c-s", coupon_code: "S" });
    for (const reihe of [[a, b, c], [c, b, a], [b, c, a]]) {
      const plan = planeGruppe(reihe);
      assert.deepEqual(plan.behalten, { couponId: "c-p", code: "P" });
      assert.deepEqual([...plan.ueberzaehlige].sort(), ["c-s", "c-t"]);
    }
  });

  it("ohne aktive Kontingente bleibt kein Coupon: alle werden abgeschaltet", () => {
    const plan = planeGruppe([z({ status: "disabled", vivenu_coupon_id: "c1" }), z({ id: "y", pass_type: "talent", status: "disabled", vivenu_coupon_id: "c2" })]);
    assert.equal(plan.behalten, null);
    assert.deepEqual([...plan.ueberzaehlige].sort(), ["c1", "c2"]);
    assert.equal(plan.summe, 0);
  });

  it("ein von Hand gesetzter Code an einer Zeile ohne Coupon wird für den neuen Coupon vorgemerkt", () => {
    const plan = planeGruppe([z({ coupon_code: "MEIN-CODE", status: "pending_vivenu" })]);
    assert.equal(plan.manuellerCode, "MEIN-CODE");
    assert.equal(plan.behalten, null);
  });

  it("uneinheitlich ist, was mehr als einen Coupon trägt oder einen neben Zeilen ohne — abgeschaltete Zeilen zählen nicht", () => {
    assert.equal(istUneinheitlich([z({ vivenu_coupon_id: "a" }), z({ vivenu_coupon_id: "b" })]), true);
    assert.equal(istUneinheitlich([z({ vivenu_coupon_id: "a" }), z({ vivenu_coupon_id: null, status: "pending_vivenu" })]), true);
    assert.equal(istUneinheitlich([z({ vivenu_coupon_id: "a" }), z({ vivenu_coupon_id: "a" })]), false);
    assert.equal(istUneinheitlich([z({ vivenu_coupon_id: "a" }), z({ vivenu_coupon_id: "b", status: "disabled" })]), false);
    assert.equal(istUneinheitlich([z({ vivenu_coupon_id: null }), z({ vivenu_coupon_id: null })]), false);
  });
});

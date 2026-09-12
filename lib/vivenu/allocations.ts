import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { VivenuError, createCoupon, getEvent, hasVivenuKey, putUnderShops, updateCoupon, type CouponInput, type UnderShop, type UnderShopTicket, type VivenuTicketType } from "@/lib/vivenu/client";
import { couponCode, undershopName, undershopUrl } from "@/lib/vivenu/naming";

/** Zeile aus `ticket_allocations_pending()`. */
export type PendingAllocation = {
  id: string;
  org_id: string;
  org_name: string;
  org_slug: string | null;
  edition_id: string;
  edition_slug: string;
  vivenu_event_id: string;
  pass_type: string;
  quantity: number;
  status: string;
  coupon_code: string | null;
  vivenu_coupon_id: string | null;
  vivenu_undershop_id: string | null;
  org_undershop_id: string | null;
  ticket_type_ids: string[];
};

export type ProvisionSummary = {
  pending: number;
  created: number;
  updated: number;
  disabled: number;
  errors: number;
  skipped?: string;
  runs: { id: string; org: string; pass_type: string; outcome: string; detail?: string }[];
};

/**
 * Offene Kontingente in vivenu anlegen: je Event einmal lesen, je Partner einen Undershop (alle Pass-Typen der Org, Preis 0, Freischaltung per
 * Coupon), je Kontingent einen Coupon (100 %, `maxTickets` = Menge, `allowedTickets` = Tickettypen des Pass-Typs, `unlocks` auf den Undershop).
 * Deaktivierte Kontingente schalten ihren Coupon ab. Ohne `VIVENU_API_KEY`: Trockenlauf, alles bleibt `pending_vivenu`.
 */
export async function provisionAllocations(admin: SupabaseClient, jobId: number | null, only?: string): Promise<ProvisionSummary> {
  const summary: ProvisionSummary = { pending: 0, created: 0, updated: 0, disabled: 0, errors: 0, runs: [] };
  const { data, error } = await admin.rpc("ticket_allocations_pending");
  if (error) throw new Error(`ticket_allocations_pending: ${error.message}`);
  let rows = (data ?? []) as PendingAllocation[];
  if (only) rows = rows.filter((r) => r.id === only);
  summary.pending = rows.length;
  if (rows.length === 0) return summary;
  if (!hasVivenuKey()) {
    console.info(`[vivenu] Trockenlauf: ${rows.length} Kontingent(e) warten (kein VIVENU_API_KEY).`);
    return { ...summary, skipped: "VIVENU_API_KEY fehlt – Kontingente bleiben pending_vivenu" };
  }

  const byEvent = new Map<string, PendingAllocation[]>();
  for (const r of rows) byEvent.set(r.vivenu_event_id, [...(byEvent.get(r.vivenu_event_id) ?? []), r]);

  for (const [eventId, eventRows] of byEvent) {
    let event;
    try {
      event = await getEvent(eventId);
    } catch (e) {
      await failAll(admin, eventRows, summary, jobId, e);
      continue;
    }
    // Undershops je Org sicherstellen (ein PUT je Event).
    //
    // Geformt wird aus **allen** Kontingenten der betroffenen Orgs, nicht nur aus
    // den offenen: der Shop trägt Kontingent, Obergrenze und die Liste der
    // offenen Tickettypen. Aus einer einzelnen offenen Zeile geformt, hat der
    // Lauf am 12.09. den Shop des Partners leergeräumt.
    const shops: UnderShop[] = [...(event.underShops ?? [])];
    const orgIds = [...new Set(eventRows.map((r) => r.org_id))];
    const { data: allData, error: allErr } = await admin.rpc("ticket_allocations_of_orgs", {
      p_event_id: eventRows[0].edition_id,
      p_org_ids: orgIds,
    });
    if (allErr) {
      await failAll(admin, eventRows, summary, jobId, new Error(`ticket_allocations_of_orgs: ${allErr.message}`));
      continue;
    }
    const allRows = (allData ?? []) as PendingAllocation[];
    const orgs = new Map<string, PendingAllocation[]>();
    for (const r of allRows) orgs.set(r.org_id, [...(orgs.get(r.org_id) ?? []), r]);
    let changed = false;
    const typeNames = new Map((event.tickets ?? []).map((t) => [String(t._id), String(t.name ?? "Ticket")]));
    // Ein Undershop **ohne** eigenes Verkaufsfenster ist für die Kasse nicht im
    // Verkauf: `POST /checkout` antwortet „Shop is not on sale", obwohl der Shop
    // im Browser normal aussieht und Tickets in den Warenkorb lässt (12.09.).
    // Wir übernehmen das Fenster des Events.
    const sellWindow: Record<string, unknown> = {};
    if (typeof event.sellStart === "string") sellWindow.sellStart = event.sellStart;
    if (typeof event.sellEnd === "string") sellWindow.sellEnd = event.sellEnd;
    for (const [, orgRows] of orgs) {
      const first = orgRows[0];
      const wantedName = undershopName(first.edition_slug, first.org_name);
      const knownId = orgRows.map((r) => r.vivenu_undershop_id ?? r.org_undershop_id).find(Boolean);
      let shop = shops.find((s) => (knownId && s._id === knownId) || s.name === wantedName);
      // Je Tickettyp die Summe der Kontingente dieser Org — das ist die Stückzahl,
      // die der Undershop höchstens hergeben darf.
      const wanted = new Map<string, number>();
      for (const r of orgRows) {
        if (r.status === "disabled") continue;
        for (const t of r.ticket_type_ids) wanted.set(t, (wanted.get(t) ?? 0) + r.quantity);
      }
      const row = (baseTicket: string): UnderShopTicket => ({
        baseTicket,
        name: typeNames.get(baseTicket) ?? "Ticket",
        price: 0,
        amount: wanted.get(baseTicket) ?? 0,
        active: true,
      });
      // Ein Undershop bietet von sich aus **alle** Tickettypen des Events an.
      // Ohne Gegenmaßnahme sähe ein Partner im eigenen Shop auch den Speaker
      // Pass und könnte ihn zum vollen Preis kaufen (12.09. in der Sandbox
      // nachgestellt). `availabilityMode: "contingentsOnly"` ändert daran
      // nichts — nur eine ausdrücklich **inaktive** Zeile blendet den Typ aus.
      const closed = (t: VivenuTicketType): UnderShopTicket => ({
        baseTicket: String(t._id),
        name: String(t.name ?? "Ticket"),
        price: typeof t.price === "number" ? t.price : 0,
        amount: 0,
        active: false,
      });
      const foreign = (event.tickets ?? []).filter((t) => !wanted.has(String(t._id)));
      // `inventoryStrategy` steht per Vorgabe auf `independent`: der Undershop
      // führt ein **eigenes** Kontingent. Ohne `maxAmount` ist das null, und der
      // Shop lässt nichts in den Warenkorb — am 12.09. in der Sandbox gesehen,
      // alle Plus-Knöpfe waren ausgegraut, auch die der fremden Tickettypen.
      // Deshalb bekommt jeder Partnershop die Summe seiner Kontingente.
      const total = [...wanted.values()].reduce((a, b) => a + b, 0);
      if (!shop) {
        shop = {
          name: wantedName,
          active: true,
          unlockMode: "couponCode",
          maxAmount: total,
          maxAmountPerOrder: total,
          ...sellWindow,
          tickets: [...[...wanted.keys()].map(row), ...foreign.map(closed)],
        };
        shops.push(shop);
        changed = true;
        continue;
      }
      // Zeilen ohne `baseTicket` zeigen auf nichts und können nichts verkaufen —
      // Schrott aus den Fehlversuchen vom 12.09. Sie müssen weg, sonst weist
      // vivenu das ganze PUT ab (`baseTicket` ist Pflichtfeld).
      const tickets = (shop.tickets ?? []).filter((t) => Boolean(t.baseTicket));
      let touched = tickets.length !== (shop.tickets ?? []).length;
      if (touched) console.warn(`[vivenu] Undershop ${shop._id ?? wantedName}: ${(shop.tickets ?? []).length - tickets.length} Ticketzeile(n) ohne baseTicket entfernt.`);
      for (const [baseTicket, amount] of wanted) {
        // vivenu legt neue Tickettypen von selbst in jedem Undershop ab — inaktiv
        // und zum vollen Preis. Eine solche Zeile wird übernommen, nicht verdoppelt.
        const existing = tickets.find((t) => t.baseTicket === baseTicket);
        if (!existing) {
          tickets.push(row(baseTicket));
          touched = true;
          continue;
        }
        if (existing.price !== 0 || existing.active !== true || existing.amount !== amount) {
          existing.price = 0;
          existing.active = true;
          existing.amount = amount;
          touched = true;
        }
      }
      for (const t of foreign) {
        const existing = tickets.find((x) => x.baseTicket === String(t._id));
        if (!existing) {
          tickets.push(closed(t));
          touched = true;
        } else if (existing.active !== false) {
          existing.active = false;
          existing.amount = 0;
          touched = true;
        }
      }
      if (shop.maxAmount !== total) {
        shop.maxAmount = total;
        touched = true;
      }
      if (shop.maxAmountPerOrder !== total) {
        shop.maxAmountPerOrder = total;
        touched = true;
      }
      // Nur füllen, nie überschreiben: wer das Fenster im Dashboard enger
      // gezogen hat, soll es behalten.
      for (const [k, v] of Object.entries(sellWindow)) {
        if (shop[k] == null && v != null) {
          shop[k] = v;
          touched = true;
        }
      }
      if (touched) {
        changed = true;
        shop.tickets = tickets;
        shop.active = true;
        shop.unlockMode = shop.unlockMode ?? "couponCode";
      }
    }
    let currentShops = shops;
    if (changed) {
      try {
        const updated = await putUnderShops(eventId, shops);
        // IDs neuer Undershops kommen erst aus der Antwort (oder einem erneuten GET)
        currentShops = updated.underShops?.length ? updated.underShops : (await getEvent(eventId)).underShops ?? shops;
      } catch (e) {
        await failAll(admin, eventRows, summary, jobId, e);
        continue;
      }
    }

    for (const r of eventRows) {
      const shopName = undershopName(r.edition_slug, r.org_name);
      const shop = currentShops.find((s) => (r.vivenu_undershop_id && s._id === r.vivenu_undershop_id) || (r.org_undershop_id && s._id === r.org_undershop_id) || s.name === shopName);
      try {
        if (r.status === "disabled") {
          // PUT ersetzt den Coupon: den vollen Satz schicken und nur die
          // Grenzen zudrehen, sonst verlöre der Coupon Name, Rabatt und
          // Freischaltung und wäre nicht wieder einzuschalten.
          if (r.vivenu_coupon_id && shop?._id) {
            await updateCoupon(r.vivenu_coupon_id, {
              name: `${shopName} · ${r.pass_type}`,
              ...couponFields(eventId, shop._id, r),
              active: false,
              maxTickets: 0,
              maxUsage: 0,
            });
          }
          await admin.rpc("set_ticket_allocation_vivenu", { p_id: r.id, p_status: "disabled" });
          summary.disabled += 1;
          summary.runs.push({ id: r.id, org: r.org_name, pass_type: r.pass_type, outcome: "disabled" });
          continue;
        }
        if (!shop?._id) throw new Error("Undershop ohne _id in der vivenu-Antwort");
        if (r.ticket_type_ids.length === 0) throw new Error(`keine Tickettypen für Pass-Typ ${r.pass_type} in ticket_type_map`);
        if (r.vivenu_coupon_id) {
          await updateCoupon(r.vivenu_coupon_id, { name: `${shopName} · ${r.pass_type}`, ...couponFields(eventId, shop._id, r) });
          await admin.rpc("set_ticket_allocation_vivenu", {
            p_id: r.id, p_status: "active", p_vivenu_undershop_id: shop._id, p_undershop_url: undershopUrl(eventId, shop),
          });
          summary.updated += 1;
          summary.runs.push({ id: r.id, org: r.org_name, pass_type: r.pass_type, outcome: "updated" });
        } else {
          const code = r.coupon_code ?? couponCode(r.edition_slug, r.org_slug, r.org_name, r.pass_type);
          const coupon = await createCoupon({ name: `${shopName} · ${r.pass_type}`, code, ...couponFields(eventId, shop._id, r) });
          await admin.rpc("set_ticket_allocation_vivenu", {
            p_id: r.id, p_status: "active", p_coupon_code: coupon.code ?? code, p_vivenu_coupon_id: String(coupon._id),
            p_vivenu_undershop_id: shop._id, p_undershop_url: undershopUrl(eventId, shop),
          });
          summary.created += 1;
          summary.runs.push({ id: r.id, org: r.org_name, pass_type: r.pass_type, outcome: "created" });
        }
      } catch (e) {
        await failOne(admin, r, summary, jobId, e);
      }
    }
  }
  return summary;
}

/**
 * Die Rabatt- und Grenzfelder eines Kontingent-Coupons. Anlegen und Ändern
 * setzen dieselben Werte, damit ein nachträglich erhöhtes Kontingent nicht
 * an einer alten Grenze hängen bleibt.
 *
 * `PUT /coupon/{id}` **ersetzt** den Coupon, es ist kein Patch: ohne `name`
 * antwortet vivenu mit 400 („name is required"). Jeder Aufruf schickt daher
 * den vollen Satz mit — wer hier ein Feld wegliesse, löschte es im Coupon.
 */
function couponFields(eventId: string, underShopId: string, r: PendingAllocation): Partial<CouponInput> {
  return {
    // `var` ist der prozentuale Rabatt, und der Wert ist ein **Anteil**:
    // 1 = 100 %. Mit 100 zeigt der Shop „-10000.00 %" an (am 12.09. im
    // Sandbox-Warenkorb gesehen) und nimmt nichts mehr in den Korb.
    discountType: "var",
    discountValue: 1,
    // Ohne die beiden `allowAll…: false` gälte der Coupon fuer alle Events und
    // alle Tickettypen des Kontos — siehe CouponInput in lib/vivenu/client.ts.
    allowAllEvents: false,
    allowedEvents: [eventId],
    allowAllTickets: false,
    allowedTickets: r.ticket_type_ids,
    unlocks: [{ target: "underShop", eventId, underShopId }],
    maxTickets: r.quantity,
    maxUsage: Math.max(1, r.quantity),
    singleUsage: false,
    active: true,
  };
}

async function failOne(admin: SupabaseClient, r: PendingAllocation, summary: ProvisionSummary, jobId: number | null, e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  summary.errors += 1;
  summary.runs.push({ id: r.id, org: r.org_name, pass_type: r.pass_type, outcome: "error", detail: message.slice(0, 300) });
  await admin.rpc("set_ticket_allocation_vivenu", { p_id: r.id, p_status: "error", p_error: message.slice(0, 500) });
  await admin.rpc("record_sync_error", {
    p_job_id: jobId, p_object_type: "ticket_allocation", p_object_id: r.id, p_message: message.slice(0, 500),
    p_payload: e instanceof VivenuError ? { status: e.status, path: e.path } : null,
  });
}

async function failAll(admin: SupabaseClient, rows: PendingAllocation[], summary: ProvisionSummary, jobId: number | null, e: unknown) {
  for (const r of rows) await failOne(admin, r, summary, jobId, e);
}

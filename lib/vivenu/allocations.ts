import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { VivenuError, createCoupon, getEvent, hasVivenuKey, putUnderShops, updateCoupon, type UnderShop } from "@/lib/vivenu/client";
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
    // Undershops je Org sicherstellen (ein PUT je Event)
    const shops: UnderShop[] = [...(event.underShops ?? [])];
    const orgs = new Map<string, PendingAllocation[]>();
    for (const r of eventRows) orgs.set(r.org_id, [...(orgs.get(r.org_id) ?? []), r]);
    let changed = false;
    for (const [, orgRows] of orgs) {
      const first = orgRows[0];
      const wantedName = undershopName(first.edition_slug, first.org_name);
      const knownId = orgRows.map((r) => r.vivenu_undershop_id ?? r.org_undershop_id).find(Boolean);
      let shop = shops.find((s) => (knownId && s._id === knownId) || s.name === wantedName);
      const wantedTickets = [...new Set(orgRows.filter((r) => r.status !== "disabled").flatMap((r) => r.ticket_type_ids))];
      if (!shop) {
        shop = { name: wantedName, active: true, unlockMode: "couponCode", tickets: wantedTickets.map((t) => ({ _id: t, price: 0, active: true })) };
        shops.push(shop);
        changed = true;
      } else {
        const have = new Set((shop.tickets ?? []).map((t) => t._id));
        const missing = wantedTickets.filter((t) => !have.has(t));
        if (missing.length > 0) {
          shop.tickets = [...(shop.tickets ?? []), ...missing.map((t) => ({ _id: t, price: 0, active: true }))];
          shop.active = true;
          shop.unlockMode = shop.unlockMode ?? "couponCode";
          changed = true;
        }
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
          if (r.vivenu_coupon_id) await updateCoupon(r.vivenu_coupon_id, { active: false, maxTickets: 0 });
          await admin.rpc("set_ticket_allocation_vivenu", { p_id: r.id, p_status: "disabled" });
          summary.disabled += 1;
          summary.runs.push({ id: r.id, org: r.org_name, pass_type: r.pass_type, outcome: "disabled" });
          continue;
        }
        if (!shop?._id) throw new Error("Undershop ohne _id in der vivenu-Antwort");
        if (r.ticket_type_ids.length === 0) throw new Error(`keine Tickettypen für Pass-Typ ${r.pass_type} in ticket_type_map`);
        if (r.vivenu_coupon_id) {
          await updateCoupon(r.vivenu_coupon_id, { active: true, maxTickets: r.quantity, allowedTickets: r.ticket_type_ids, unlocks: [{ eventId, underShopId: shop._id }] });
          await admin.rpc("set_ticket_allocation_vivenu", {
            p_id: r.id, p_status: "active", p_vivenu_undershop_id: shop._id, p_undershop_url: undershopUrl(eventId, shop),
          });
          summary.updated += 1;
          summary.runs.push({ id: r.id, org: r.org_name, pass_type: r.pass_type, outcome: "updated" });
        } else {
          const code = r.coupon_code ?? couponCode(r.edition_slug, r.org_slug, r.org_name, r.pass_type);
          const coupon = await createCoupon({
            name: `${shopName} · ${r.pass_type}`,
            code,
            discount: { type: "percentage", value: 100 },
            maxTickets: r.quantity,
            allowedTickets: r.ticket_type_ids,
            unlocks: [{ eventId, underShopId: shop._id }],
            active: true,
          });
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

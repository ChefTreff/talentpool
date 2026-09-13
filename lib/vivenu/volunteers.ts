import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { VivenuError, createCoupon, getEvent, hasVivenuKey, putUnderShops, type UnderShop } from "@/lib/vivenu/client";
import { undershopUrl, vivenuBase } from "@/lib/vivenu/naming";
import { randomBytes } from "node:crypto";

/** Zeile aus `volunteer_coupons_pending()`. */
export type PendingVolunteer = {
  profile_id: string;
  person_id: string;
  display_name: string | null;
  email: string | null;
  edition_id: string;
  edition_slug: string;
  vivenu_event_id: string;
  undershop_id: string | null;
  coupon_code: string | null;
  vivenu_coupon_id: string | null;
  coupon_status: string;
};

export type VolunteerSummary = {
  pending: number;
  created: number;
  errors: number;
  skipped?: string;
  undershop?: string;
  runs: { profile: string; name: string | null; outcome: string; detail?: string }[];
};

const SHOP_NAME = (editionSlug: string) => `${editionSlug.toUpperCase()} · Volunteers`;

/**
 * Code je Person: kurz genug zum Abtippen, lang genug, dass Raten nichts bringt.
 * Ohne I, O, 0 und 1 — der Code wird vorgelesen und abgeschrieben.
 */
function volunteerCode(editionSlug: string): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const raw = randomBytes(8);
  let out = "";
  for (const b of raw) out += alphabet[b % alphabet.length];
  return `${editionSlug.toUpperCase()}-VOL-${out}`;
}

/**
 * Ein Coupon je angenommenem Volunteer im Undershop „Volunteers" der Edition.
 *
 * Warum je Person und nicht ein Sammelcode: das Einlösen ist der
 * Aktivierungsschritt (Entscheidung E2). Ein Sammelcode sagt nur, **dass**
 * jemand eingelöst hat, ein persönlicher sagt **wer** — und genau das braucht
 * der Schichtplan.
 *
 * Der Undershop entsteht beim ersten Lauf und wird an der Edition gemerkt.
 * `maxUsage: 1` und `maxTickets: 1`: ein Volunteer, ein Ticket.
 */
export async function provisionVolunteerCoupons(
  admin: SupabaseClient,
  jobId: number | null,
  only?: string,
): Promise<VolunteerSummary> {
  const summary: VolunteerSummary = { pending: 0, created: 0, errors: 0, runs: [] };
  const { data, error } = await admin.rpc("volunteer_coupons_pending");
  if (error) throw new Error(`volunteer_coupons_pending: ${error.message}`);
  let rows = (data ?? []) as PendingVolunteer[];
  if (only) rows = rows.filter((r) => r.profile_id === only);
  summary.pending = rows.length;
  if (rows.length === 0) return summary;
  if (!hasVivenuKey()) {
    return { ...summary, skipped: "VIVENU_API_KEY fehlt – Coupons bleiben offen" };
  }

  // Alle offenen Volunteers einer Edition teilen sich einen Shop.
  const byEdition = new Map<string, PendingVolunteer[]>();
  for (const r of rows) byEdition.set(r.edition_id, [...(byEdition.get(r.edition_id) ?? []), r]);

  for (const [editionId, group] of byEdition) {
    const first = group[0];
    let shopId = first.undershop_id;
    let shopUrl: string | null = null;

    try {
      const event = await getEvent(first.vivenu_event_id);
      const wantedName = SHOP_NAME(first.edition_slug);
      const shops: UnderShop[] = [...(event.underShops ?? [])];
      let shop = shops.find((s) => (shopId && s._id === shopId) || s.name === wantedName);

      // Volunteers bekommen alle Tickettypen des Events zum Preis 0 — welchen
      // Pass sie ziehen, entscheidet das Team über die Tickettypen, nicht der Shop.
      const types = (event.tickets ?? []).map((t) => String(t._id));
      if (!shop) {
        shop = {
          name: wantedName,
          active: true,
          unlockMode: "couponCode",
          maxAmount: group.length + 50,
          maxAmountPerOrder: 1,
          ...(typeof event.sellStart === "string" ? { sellStart: event.sellStart } : {}),
          ...(typeof event.sellEnd === "string" ? { sellEnd: event.sellEnd } : {}),
          tickets: types.map((t) => ({ baseTicket: t, price: 0, amount: 1, active: true })),
        };
        shops.push(shop);
        const updated = await putUnderShops(first.vivenu_event_id, shops);
        const after = updated.underShops?.length ? updated.underShops : (await getEvent(first.vivenu_event_id)).underShops ?? [];
        shop = after.find((s) => s.name === wantedName) ?? shop;
      }
      if (!shop?._id) throw new Error("Undershop \u201eVolunteers\u201c ohne _id in der vivenu-Antwort");
      shopId = shop._id;
      shopUrl = undershopUrl(first.vivenu_event_id, shop);
      summary.undershop = shopId;
      if (shopId !== first.undershop_id) {
        await admin.rpc("set_edition_volunteer_undershop", { p_edition_id: editionId, p_undershop_id: shopId });
      }
    } catch (e) {
      for (const r of group) await failOne(admin, r, summary, jobId, e);
      continue;
    }

    for (const r of group) {
      try {
        const code = r.coupon_code ?? volunteerCode(r.edition_slug);
        const coupon = await createCoupon({
          name: `Volunteer · ${r.display_name ?? r.profile_id}`,
          code,
          discountType: "var",
          discountValue: 1,
          allowAllEvents: false,
          allowedEvents: [r.vivenu_event_id],
          allowAllTickets: true,
          unlocks: [{ target: "underShop", eventId: r.vivenu_event_id, underShopId: shopId! }],
          // Ein Volunteer, ein Ticket.
          maxTickets: 1,
          maxUsage: 1,
          singleUsage: true,
          active: true,
        });
        await admin.rpc("set_volunteer_coupon", {
          p_profile_id: r.profile_id,
          p_status: "issued",
          p_coupon_code: coupon.code ?? code,
          p_vivenu_coupon_id: String(coupon._id),
        });
        summary.created += 1;
        summary.runs.push({ profile: r.profile_id, name: r.display_name, outcome: "created" });
      } catch (e) {
        await failOne(admin, r, summary, jobId, e);
      }
    }

    if (shopUrl) console.info(`[vivenu] Volunteer-Shop ${first.edition_slug}: ${shopUrl}`);
    else console.warn(`[vivenu] Volunteer-Shop ${first.edition_slug} ohne Link — VIVENU_SHOP_BASE fehlt (${vivenuBase().shop}).`);
  }

  return summary;
}

async function failOne(
  admin: SupabaseClient,
  r: PendingVolunteer,
  summary: VolunteerSummary,
  jobId: number | null,
  e: unknown,
) {
  const message = e instanceof Error ? e.message : String(e);
  summary.errors += 1;
  summary.runs.push({ profile: r.profile_id, name: r.display_name, outcome: "error", detail: message.slice(0, 300) });
  await admin.rpc("set_volunteer_coupon", {
    p_profile_id: r.profile_id,
    p_status: "error",
    p_error: message.slice(0, 500),
  });
  await admin.rpc("record_sync_error", {
    p_job_id: jobId,
    p_object_type: "volunteer_coupon",
    p_object_id: r.profile_id,
    p_message: message.slice(0, 500),
    p_payload: e instanceof VivenuError ? { status: e.status, path: e.path } : null,
  });
}

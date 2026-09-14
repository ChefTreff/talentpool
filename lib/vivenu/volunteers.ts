import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { VivenuError, createCoupon, getEvent, hasVivenuKey, putUnderShops, updateCoupon, type UnderShop } from "@/lib/vivenu/client";
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
  /** Zurückgezogene Zusagen, deren Coupon bei vivenu abgeschaltet wurde. */
  revoked: number;
  errors: number;
  skipped?: string;
  undershop?: string;
  runs: { profile: string; name: string | null; outcome: string; detail?: string }[];
};

/** Zeile aus `volunteer_coupon_revocations_pending()`. */
type PendingRevocation = {
  id: number;
  profile_id: string;
  vivenu_coupon_id: string | null;
  coupon_code: string | null;
  revoked_at: string;
  error: string | null;
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
  const summary: VolunteerSummary = { pending: 0, created: 0, revoked: 0, errors: 0, runs: [] };

  // Erst die Widerrufe, dann die Ausgabe: ein zurückgezogener Coupon soll nicht
  // eine Runde länger gelten als nötig.
  await revokeCoupons(admin, jobId, summary);

  const { data, error } = await admin.rpc("volunteer_coupons_pending");
  if (error) throw new Error(`volunteer_coupons_pending: ${error.message}`);
  let rows = (data ?? []) as PendingVolunteer[];
  if (only) rows = rows.filter((r) => r.profile_id === only);
  summary.pending = rows.length;
  if (!hasVivenuKey()) {
    return { ...summary, skipped: "VIVENU_API_KEY fehlt – Coupons bleiben offen" };
  }

  // Alle offenen Volunteers einer Edition teilen sich einen Shop.
  const byEdition = new Map<string, PendingVolunteer[]>();
  for (const r of rows) byEdition.set(r.edition_id, [...(byEdition.get(r.edition_id) ?? []), r]);

  /**
   * Auch Editionen **ohne** offene Coupons kommen mit.
   *
   * Sonst prüft niemand mehr den Shop, sobald alle Codes ausgegeben sind — ein
   * Shop, der zu viele Tickettypen führt, bliebe für immer offen. Denselben
   * Fehler hatte der Partner-Sync (0079): aus dem Ausschnitt geformt statt aus
   * dem ganzen Bild.
   */
  const { data: mitShop } = await admin
    .from("event")
    .select("id, slug, vivenu_event_id, vivenu_volunteer_undershop_id")
    .eq("is_edition", true)
    .not("vivenu_volunteer_undershop_id", "is", null);
  for (const e of (mitShop ?? []) as {
    id: string;
    slug: string;
    vivenu_event_id: string | null;
    vivenu_volunteer_undershop_id: string | null;
  }[]) {
    if (byEdition.has(e.id) || !e.vivenu_event_id) continue;
    byEdition.set(e.id, [
      {
        profile_id: "",
        person_id: "",
        display_name: null,
        email: null,
        edition_id: e.id,
        edition_slug: e.slug,
        vivenu_event_id: e.vivenu_event_id,
        undershop_id: e.vivenu_volunteer_undershop_id,
        coupon_code: null,
        vivenu_coupon_id: null,
        coupon_status: "none",
      },
    ]);
  }
  if (byEdition.size === 0) return summary;

  for (const [editionId, group] of byEdition) {
    const first = group[0];
    // Platzhalterzeile: die Edition kommt nur wegen ihres Shops mit.
    const nurShop = first.profile_id === "";
    let shopId = first.undershop_id;
    let shopUrl: string | null = null;

    // Die Tickettypen, die Volunteers ziehen dürfen — aus der Zuordnung, nicht
    // aus dem Event. Die Edition und ihre Veranstaltungen zählen beide, weil
    // `ticket_type_map` an der Veranstaltung hängt (siehe 0068).
    const { data: mapRows } = await admin
      .from("ticket_type_map")
      .select("vivenu_ticket_type_id, event:event_id!inner(id, edition_id)")
      .eq("pass_type", "crew")
      .eq("active", true);
    const crewTypes = ((mapRows ?? []) as unknown as {
      vivenu_ticket_type_id: string;
      event: { id: string; edition_id: string | null } | null;
    }[])
      .filter((m) => m.event?.id === editionId || m.event?.edition_id === editionId)
      .map((m) => m.vivenu_ticket_type_id);

    try {
      const event = await getEvent(first.vivenu_event_id);
      const wantedName = SHOP_NAME(first.edition_slug);
      const shops: UnderShop[] = [...(event.underShops ?? [])];
      let shop = shops.find((s) => (shopId && s._id === shopId) || s.name === wantedName);

      // **Nur Crew-Tickettypen.** Vorher standen hier alle Tickettypen des
      // Events zum Preis 0 — ein Volunteer hätte sich damit einen Partner-
      // oder Speaker-Pass ziehen können (Review der Architektur-Session,
      // 14.09.). Welche Typen für Volunteers gelten, sagt `ticket_type_map`:
      // `pass_type = 'crew'`. Gibt es keinen, wird der Shop **nicht** angelegt —
      // „alle Typen" als Rückfall wäre genau der Fehler, den wir gerade
      // abstellen.
      if (crewTypes.length === 0) {
        throw new Error(
          "Kein Tickettyp mit pass_type 'crew' in ticket_type_map — ohne ihn kein Volunteer-Shop",
        );
      }
      const types = crewTypes;
      if (!shop) {
        shop = {
          name: wantedName,
          active: true,
          unlockMode: "couponCode",
          maxAmount: (nurShop ? 0 : group.length) + 50,
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
      else {
        // Ein Shop aus einem früheren Lauf kann noch alle Typen führen.
        const gewollt = new Set(types);
        const tickets = (shop.tickets ?? []).filter((t) => Boolean(t.baseTicket));
        let geaendert = tickets.length !== (shop.tickets ?? []).length;
        for (const t of tickets) {
          const soll = gewollt.has(String(t.baseTicket));
          if (t.active !== soll || (soll && t.price !== 0)) {
            t.active = soll;
            if (soll) t.price = 0;
            else t.amount = 0;
            geaendert = true;
          }
        }
        for (const typ of types) {
          if (!tickets.some((t) => t.baseTicket === typ)) {
            tickets.push({ baseTicket: typ, price: 0, amount: 1, active: true });
            geaendert = true;
          }
        }
        if (geaendert) {
          shop.tickets = tickets;
          const updated = await putUnderShops(first.vivenu_event_id, shops);
          const after = updated.underShops?.length ? updated.underShops : (await getEvent(first.vivenu_event_id)).underShops ?? [];
          shop = after.find((s) => s._id === shop!._id || s.name === wantedName) ?? shop;
        }
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
      if (r.profile_id === "") continue;
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

/**
 * Zurückgezogene Zusagen bei vivenu abschalten.
 *
 * Bei uns steht der Coupon nach einer Absage auf `revoked` — bei vivenu galt er
 * weiter. Ein abgelehnter Volunteer hätte damit einen gültigen 100-%-Code in
 * der Hand behalten (Review der Architektur-Session, 14.09.). Die Datenbank
 * schreibt jeden Widerruf in `volunteer_coupon_revocation`; hier wird er
 * ausgeführt und quittiert.
 *
 * `updateCoupon` ersetzt den Coupon (PUT), deshalb muss `name` mit — sonst
 * antwortet vivenu mit 400. Bleibt ein Widerruf offen, steht er beim nächsten
 * Lauf wieder da: lieber zweimal abschalten als einmal nicht.
 */
async function revokeCoupons(
  admin: SupabaseClient,
  jobId: number | null,
  summary: VolunteerSummary,
): Promise<void> {
  const { data, error } = await admin.rpc("volunteer_coupon_revocations_pending");
  if (error) {
    console.error("[vivenu] volunteer_coupon_revocations_pending:", error.message);
    return;
  }
  const rows = (data ?? []) as PendingRevocation[];
  if (rows.length === 0) return;
  if (!hasVivenuKey()) {
    console.warn(`[vivenu] ${rows.length} Widerruf(e) warten – kein VIVENU_API_KEY.`);
    return;
  }

  for (const r of rows) {
    if (!r.vivenu_coupon_id) {
      // Nie ausgegeben, nichts abzuschalten — Haken dran.
      await admin.rpc("mark_volunteer_coupon_revoked", { p_id: r.id });
      continue;
    }
    try {
      await updateCoupon(r.vivenu_coupon_id, {
        name: `Volunteer · zurückgezogen`,
        active: false,
        maxTickets: 0,
        maxUsage: 0,
      });
      await admin.rpc("mark_volunteer_coupon_revoked", { p_id: r.id });
      summary.revoked += 1;
      summary.runs.push({ profile: r.profile_id, name: r.coupon_code, outcome: "revoked" });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      summary.errors += 1;
      summary.runs.push({ profile: r.profile_id, name: r.coupon_code, outcome: "revoke_error", detail: message.slice(0, 300) });
      await admin.rpc("mark_volunteer_coupon_revoked", { p_id: r.id, p_error: message.slice(0, 500) });
      await admin.rpc("record_sync_error", {
        p_job_id: jobId,
        p_object_type: "volunteer_coupon_revocation",
        p_object_id: r.profile_id,
        p_message: message.slice(0, 500),
        p_payload: e instanceof VivenuError ? { status: e.status, path: e.path } : null,
      });
    }
  }
}

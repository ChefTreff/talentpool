import type { SupabaseClient } from "@supabase/supabase-js";
import type { CouponInput, UnderShop, UnderShopTicket, VivenuCoupon, VivenuEvent, VivenuTicketType } from "@/lib/vivenu/client";
import { gruppenCode, undershopName, undershopUrl } from "@/lib/vivenu/naming";
import {
  abgeloestCouponName,
  abgeschalteteFelder,
  gruppenCouponFelder,
  gruppenCouponName,
  gruppiere,
  istUneinheitlich,
  planeGruppe,
  type PendingAllocation,
} from "@/lib/vivenu/kontingent-gruppe";

export type { PendingAllocation };

export type ProvisionSummary = {
  pending: number;
  /** Coupons, die neu angelegt wurden — seit PART-111 einer je Gruppe, nicht je Kontingent. */
  created: number;
  /** Coupons, die erweitert oder nachgezogen wurden — einer je bearbeiteter Gruppe. */
  updated: number;
  /** Kontingente (Zeilen), die auf den gemeinsamen Coupon ihrer Gruppe umgezogen sind. */
  merged: number;
  /** Coupons aus der Zeit je Kategorie, die abgeschaltet wurden. */
  retired: number;
  /** Kontingente (Zeilen), die abgeschlossen wurden, weil kein Produkt sie mehr trägt. */
  disabled: number;
  errors: number;
  skipped?: string;
  runs: { id: string; org: string; pass_type: string; outcome: string; detail?: string }[];
};

/** Die vivenu-Aufrufe, die der Lauf braucht — hereingereicht, damit der Lauf ohne Netz im Test läuft. */
export type VivenuWerkzeug = {
  hasVivenuKey(): boolean;
  getEvent(eventId: string): Promise<VivenuEvent>;
  putUnderShops(eventId: string, underShops: UnderShop[]): Promise<VivenuEvent>;
  createCoupon(input: CouponInput): Promise<VivenuCoupon>;
  updateCoupon(couponId: string, patch: Partial<CouponInput>): Promise<VivenuCoupon>;
};

/**
 * Offene Kontingente in vivenu anlegen: je Event einmal lesen, je Partner einen Undershop (alle Pass-Typen der Org, Preis 0, Freischaltung per
 * Coupon), je **Gruppe** (Organisation, Edition, Rabattstufe) **einen** Coupon (`maxTickets` = Summe der Mengen, `allowedTickets` = Tickettypen
 * aller aktiven Kategorien, `unlocks` auf den Undershop; PART-111). Code und Coupon-Id stehen danach auf allen Zeilen der Gruppe.
 *
 * Eine Gruppe aus der Zeit je Kategorie — mehrere Coupons — bringt der Lauf auf einen: er behält und erweitert den ersten vorhandenen und
 * schaltet die übrigen ab (vivenu kennt kein Löschen). Das geschieht auch, wenn keine Zeile mehr aussteht (nur im Gesamtlauf, nicht bei
 * `?allocation=<id>`). Deaktivierte Kontingente schalten ihren Coupon ab. Ohne `VIVENU_API_KEY`: Trockenlauf, alles bleibt `pending_vivenu`.
 */
export async function provisionAllocations(
  vivenu: VivenuWerkzeug,
  admin: SupabaseClient,
  jobId: number | null,
  only?: string,
): Promise<ProvisionSummary> {
  const summary: ProvisionSummary = { pending: 0, created: 0, updated: 0, merged: 0, retired: 0, disabled: 0, errors: 0, runs: [] };
  const { data, error } = await admin.rpc("ticket_allocations_pending");
  if (error) throw new Error(`ticket_allocations_pending: ${error.message}`);
  let rows = normiert((data ?? []) as PendingAllocation[]);
  if (only) rows = rows.filter((r) => r.id === only);
  summary.pending = rows.length;

  const uneinheitliche = only ? [] : await findeUneinheitliche(admin);
  if (rows.length === 0 && uneinheitliche.length === 0) return summary;
  if (!vivenu.hasVivenuKey()) {
    console.info(`[vivenu] Trockenlauf: ${rows.length} Kontingent(e) warten, ${uneinheitliche.length} Gruppe(n) mit mehreren Coupons (kein VIVENU_API_KEY).`);
    return { ...summary, skipped: "VIVENU_API_KEY fehlt – Kontingente bleiben pending_vivenu" };
  }

  // Was zu tun ist, je Edition: die Organisationen mit einer offenen Zeile und die mit uneinheitlicher Gruppe.
  const nachEdition = new Map<string, Set<string>>();
  const merke = (edition: string, org: string) => nachEdition.set(edition, (nachEdition.get(edition) ?? new Set<string>()).add(org));
  for (const r of rows) merke(r.edition_id, r.org_id);
  for (const u of uneinheitliche) merke(u.edition_id, u.org_id);
  const ausstehend = new Set(rows.map((r) => r.id));

  for (const [editionId, orgSet] of nachEdition) {
    const eventRows = rows.filter((r) => r.edition_id === editionId);
    const orgIds = [...orgSet];
    const { data: allData, error: allErr } = await admin.rpc("ticket_allocations_of_orgs", { p_event_id: editionId, p_org_ids: orgIds });
    if (allErr) {
      await scheitert(admin, eventRows, summary, jobId, new Error(`ticket_allocations_of_orgs: ${allErr.message}`));
      continue;
    }
    // Geformt wird aus **allen** Kontingenten der betroffenen Orgs, nicht nur aus den offenen: der Shop trägt Kontingent, Obergrenze und die
    // Liste der offenen Tickettypen. Aus einer einzelnen offenen Zeile geformt, hat der Lauf am 12.09. den Shop des Partners leergeräumt.
    const allRows = normiert((allData ?? []) as PendingAllocation[]);
    const eventId = allRows[0]?.vivenu_event_id;
    if (!eventId) continue;

    let event;
    try {
      event = await vivenu.getEvent(eventId);
    } catch (e) {
      await scheitert(admin, eventRows, summary, jobId, e);
      continue;
    }
    // Undershops je Org sicherstellen (ein PUT je Event).
    //
    // Geformt wird aus **allen** Kontingenten der betroffenen Orgs (siehe oben).
    const shops: UnderShop[] = [...(event.underShops ?? [])];
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
      //
      // Geschlossen wird deshalb nur, was **noch keine Zeile hat**. Eine Zeile,
      // die jemand im Dashboard aktiviert hat, bleibt aktiv (Konrads
      // Entscheidung 13.09.): der Sync macht die Tür zu, die niemand bedacht
      // hat, und nicht die, die jemand absichtlich geöffnet hat.
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
      // vivenu das ganze PUT ab (`baseTicket` ist Pflichtfeld). Ebenso Zeilen
      // auf Tickettypen, die es im Event nicht mehr gibt.
      const tickets = (shop.tickets ?? []).filter((t) => Boolean(t.baseTicket) && typeNames.has(String(t.baseTicket)));
      let touched = tickets.length !== (shop.tickets ?? []).length;
      if (touched) console.warn(`[vivenu] Undershop ${shop._id ?? wantedName}: ${(shop.tickets ?? []).length - tickets.length} Ticketzeile(n) ohne gueltigen Tickettyp entfernt.`);
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
        if (tickets.some((x) => x.baseTicket === String(t._id))) continue;
        tickets.push(closed(t));
        touched = true;
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
        const updated = await vivenu.putUnderShops(eventId, shops);
        // IDs neuer Undershops kommen erst aus der Antwort (oder einem erneuten GET)
        currentShops = updated.underShops?.length ? updated.underShops : (await vivenu.getEvent(eventId)).underShops ?? shops;
      } catch (e) {
        await scheitert(admin, eventRows, summary, jobId, e);
        continue;
      }
    }

    // Je Gruppe ein Coupon (PART-111). Bearbeitet wird eine Gruppe, wenn eine ihrer Zeilen aussteht oder sie uneinheitlich ist.
    for (const [, zeilen] of gruppiere(allRows)) {
      if (!zeilen.some((z) => ausstehend.has(z.id)) && !istUneinheitlich(zeilen)) continue;
      await bearbeiteGruppe({ vivenu, admin, summary, jobId, eventId, currentShops, ausstehend }, zeilen);
    }
  }
  return summary;
}

type Umfeld = {
  vivenu: VivenuWerkzeug;
  admin: SupabaseClient;
  summary: ProvisionSummary;
  jobId: number | null;
  eventId: string;
  currentShops: UnderShop[];
  ausstehend: Set<string>;
};

/**
 * Eine Gruppe: einen Coupon sicherstellen, die übrigen der Gruppe abschalten, Code und Coupon-Id auf alle Zeilen schreiben.
 *
 * Die Reihenfolge ist die Sicherheit: erst der bleibende Coupon (angelegt oder erweitert), dann die übrigen abschalten, erst dann die Zeilen
 * umschreiben. Scheitert ein Schritt, steht die Gruppe nie ohne funktionierenden Coupon da, und der nächste Lauf holt den Rest nach — er
 * erkennt die Gruppe wieder an ihren Zeilen (ausstehend, fehlerhaft oder uneinheitlich).
 */
async function bearbeiteGruppe(u: Umfeld, zeilen: PendingAllocation[]): Promise<void> {
  const { vivenu, admin, summary, jobId, eventId, currentShops, ausstehend } = u;
  const plan = planeGruppe(zeilen);
  const erste = zeilen[0];
  const satz = erste.discount_percent;
  const shopName = undershopName(erste.edition_slug, erste.org_name);
  const shop = currentShops.find(
    (s) =>
      zeilen.some((z) => z.vivenu_undershop_id && s._id === z.vivenu_undershop_id) ||
      (erste.org_undershop_id && s._id === erste.org_undershop_id) ||
      s.name === shopName,
  );
  let abgeloest = 0;
  try {
    // Nichts mehr aktiv: die Coupons der Gruppe zudrehen, die abgeschalteten Zeilen abschließen, Zeilen ohne Tickettyp melden.
    if (plan.aktive.length === 0) {
      // PUT ersetzt den Coupon: den vollen Satz schicken und nur die Grenzen zudrehen, sonst verlöre der Coupon Name, Rabatt und
      // Freischaltung und wäre nicht wieder einzuschalten.
      for (const id of plan.ueberzaehlige) {
        const besitzer = plan.besitzer.get(id)!;
        if (shop?._id) {
          await vivenu.updateCoupon(id, {
            name: gruppenCouponName(shopName, satz),
            ...abgeschalteteFelder(eventId, shop._id, besitzer.ticket_type_ids, satz),
          });
        }
      }
      for (const r of plan.abgeschaltet.filter((z) => ausstehend.has(z.id))) {
        await schreibe(admin, "set_ticket_allocation_vivenu", { p_id: r.id, p_status: "disabled" });
        summary.disabled += 1;
        summary.runs.push({ id: r.id, org: r.org_name, pass_type: r.pass_type, outcome: "disabled" });
      }
      for (const r of plan.ohneTyp) await scheitert(admin, [r], summary, jobId, keineTypen(r));
      return;
    }

    if (!shop?._id) throw new Error("Undershop ohne _id in der vivenu-Antwort");
    const name = gruppenCouponName(shopName, satz);
    const felder = gruppenCouponFelder(eventId, shop._id, plan, satz);
    let couponId: string;
    let code: string;
    let neu = false;
    if (plan.behalten) {
      const coupon = await vivenu.updateCoupon(plan.behalten.couponId, { name, ...felder });
      couponId = plan.behalten.couponId;
      code = plan.behalten.code ?? (typeof coupon.code === "string" ? coupon.code : null) ?? plan.manuellerCode ?? "";
      if (!code) throw new Error("Coupon ohne Code in Datenbank und vivenu-Antwort");
    } else {
      const gewuenscht = plan.manuellerCode ?? gruppenCode(erste.edition_slug, erste.org_slug, erste.org_name, satz);
      const coupon = await vivenu.createCoupon({ name, code: gewuenscht, ...felder });
      couponId = String(coupon._id);
      code = typeof coupon.code === "string" && coupon.code ? coupon.code : gewuenscht;
      neu = true;
    }
    if (neu) summary.created += 1;
    else summary.updated += 1;

    // Die übrigen Coupons der Gruppe abschalten — Coupons aus der Zeit je Kategorie.
    for (const id of plan.ueberzaehlige) {
      const besitzer = plan.besitzer.get(id)!;
      await vivenu.updateCoupon(id, {
        name: abgeloestCouponName(shopName, besitzer),
        ...abgeschalteteFelder(eventId, shop._id, besitzer.ticket_type_ids, satz),
      });
      abgeloest += 1;
      summary.retired += 1;
      await protokolliereAbloesung(admin, besitzer, id, couponId);
    }

    // Code und Coupon-Id auf alle Zeilen der Gruppe. Eine Zeile, die schon stimmt und nicht aussteht, bleibt unberührt.
    const url = undershopUrl(eventId, shop);
    for (const r of plan.aktive) {
      const stimmt =
        r.status === "active" &&
        r.vivenu_coupon_id === couponId &&
        r.coupon_code === code &&
        r.vivenu_undershop_id === shop._id &&
        !ausstehend.has(r.id);
      if (stimmt) continue;
      const umgezogen = Boolean(r.vivenu_coupon_id) && r.vivenu_coupon_id !== couponId;
      await schreibe(admin, "set_ticket_allocation_vivenu", {
        p_id: r.id,
        p_status: "active",
        p_coupon_code: code,
        p_vivenu_coupon_id: couponId,
        p_vivenu_undershop_id: shop._id,
        p_undershop_url: url,
      });
      if (umgezogen) summary.merged += 1;
      summary.runs.push({ id: r.id, org: r.org_name, pass_type: r.pass_type, outcome: neu ? "created" : umgezogen ? "merged" : "updated" });
    }
    for (const r of plan.abgeschaltet.filter((z) => ausstehend.has(z.id))) {
      await schreibe(admin, "set_ticket_allocation_vivenu", { p_id: r.id, p_status: "disabled" });
      summary.disabled += 1;
      summary.runs.push({ id: r.id, org: r.org_name, pass_type: r.pass_type, outcome: "disabled" });
    }
    for (const r of plan.ohneTyp) await scheitert(admin, [r], summary, jobId, keineTypen(r));
  } catch (e) {
    // Scheitert die Gruppe, werden die Zeilen fehlerhaft, die ohnehin ausstehen oder noch keinen Code hatten. Zeilen mit einem Code, der noch
    // gilt, bleiben aktiv: der Partner soll seinen Code nicht verlieren, weil vivenu einmal nicht antwortet. Ist schon ein Coupon abgeschaltet
    // worden, kann der Code mancher Zeile tot sein, dann gilt die ganze Gruppe als fehlerhaft. Betrifft der Fehler keine Zeile — eine Gruppe,
    // die nur wartet, bis ihre Coupons zusammengeführt werden —, wird er nur gemeldet; der nächste Lauf versucht es wieder.
    const lebende = [...plan.aktive, ...plan.ohneTyp];
    const betroffen = abgeloest > 0 ? lebende : lebende.filter((r) => r.status !== "active" || ausstehend.has(r.id));
    if (betroffen.length > 0) await scheitert(admin, betroffen, summary, jobId, e);
    else await meldeNur(admin, lebende[0] ?? zeilen[0], summary, jobId, e);
  }
}

const keineTypen = (r: PendingAllocation) => new Error(`keine Tickettypen für Pass-Typ ${r.pass_type} in ticket_type_map`);

/** Nur die Spalten, die der Lauf braucht — und der Rabattsatz immer als Zahl. */
function normiert(rows: PendingAllocation[]): PendingAllocation[] {
  return rows.map((r) => ({ ...r, discount_percent: r.discount_percent ?? 100, ticket_type_ids: r.ticket_type_ids ?? [] }));
}

/**
 * Gruppen aus der Zeit je Kategorie: mehrere Coupons je Gruppe. Gelesen wird die Tabelle direkt (service_role, nach dem Secret der Route) —
 * die Funktion `ticket_allocations_pending()` kennt nur Zeilen, die aussteht, und eine Gruppe mit zwei fertigen Coupons steht nirgends aus.
 * Scheitert das Lesen, läuft der Rest weiter: die Zusammenführung wartet dann auf den nächsten Lauf.
 */
async function findeUneinheitliche(admin: SupabaseClient): Promise<{ edition_id: string; org_id: string }[]> {
  const { data, error } = await admin
    .from("org_ticket_allocation")
    .select("org_id, event_id, discount_percent, status, vivenu_coupon_id")
    .neq("status", "disabled");
  if (error) {
    console.error("[vivenu] Gruppen mit mehreren Coupons nicht lesbar:", error.message);
    return [];
  }
  type Zeile = { org_id: string; event_id: string; discount_percent: number | null; status: string; vivenu_coupon_id: string | null };
  const gruppen = new Map<string, Zeile[]>();
  for (const r of (data ?? []) as Zeile[]) {
    const k = `${r.org_id}|${r.event_id}|${r.discount_percent ?? 100}`;
    gruppen.set(k, [...(gruppen.get(k) ?? []), r]);
  }
  const treffer = new Map<string, { edition_id: string; org_id: string }>();
  for (const zeilen of gruppen.values()) {
    if (istUneinheitlich(zeilen)) treffer.set(`${zeilen[0].event_id}|${zeilen[0].org_id}`, { edition_id: zeilen[0].event_id, org_id: zeilen[0].org_id });
  }
  return [...treffer.values()];
}

/** Ein Coupon aus der Zeit je Kategorie wurde abgeschaltet: protokollieren, ohne Personendaten. Ein Fehler hier bricht den Lauf nicht ab. */
async function protokolliereAbloesung(admin: SupabaseClient, besitzer: PendingAllocation, alt: string, neu: string): Promise<void> {
  try {
    const { error } = await admin.rpc("log_audit", {
      p_action: "ticket.coupon_retired",
      p_object_type: "org_ticket_allocation",
      p_object_id: besitzer.id,
      p_before: { coupon_id: alt, pass_type: besitzer.pass_type },
      p_after: { merged_into: neu, discount_percent: besitzer.discount_percent },
    });
    if (error) console.error("[vivenu] Ablösung nicht protokolliert:", error.message);
  } catch (e) {
    console.error("[vivenu] Ablösung nicht protokolliert:", e instanceof Error ? e.message : String(e));
  }
}

/** Ein Schreibaufruf an die Datenbank, dessen Fehler nicht untergehen darf. */
async function schreibe(admin: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<void> {
  const { error } = await admin.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
}

/** Einen Fehler festhalten, ohne die Zeile fehlerhaft zu setzen: Zähler, Lauf-Eintrag und Sync-Fehler. */
async function meldeNur(admin: SupabaseClient, r: PendingAllocation, summary: ProvisionSummary, jobId: number | null, e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  summary.errors += 1;
  summary.runs.push({ id: r.id, org: r.org_name, pass_type: r.pass_type, outcome: "error", detail: message.slice(0, 300) });
  // Eine vivenu-Antwort trägt Status und Pfad (`VivenuError`) — gelesen wird beides ohne die Klasse, die nur auf dem Server lebt.
  const antwort = e as { status?: unknown; path?: unknown };
  await admin.rpc("record_sync_error", {
    p_job_id: jobId,
    p_object_type: "ticket_allocation",
    p_object_id: r.id,
    p_message: message.slice(0, 500),
    p_payload: typeof antwort?.status === "number" ? { status: antwort.status, path: antwort.path } : null,
  });
}

async function scheitertEine(admin: SupabaseClient, r: PendingAllocation, summary: ProvisionSummary, jobId: number | null, e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  await admin.rpc("set_ticket_allocation_vivenu", { p_id: r.id, p_status: "error", p_error: message.slice(0, 500) });
  await meldeNur(admin, r, summary, jobId, e);
}

async function scheitert(admin: SupabaseClient, rows: PendingAllocation[], summary: ProvisionSummary, jobId: number | null, e: unknown) {
  if (rows.length === 0) {
    // Eine Edition, in der nur eine Gruppe mit mehreren Coupons wartet: es gibt keine Zeile, die den Fehler tragen könnte.
    console.error("[vivenu] Lauf ohne offene Zeile gescheitert:", e instanceof Error ? e.message : String(e));
    return;
  }
  for (const r of rows) await scheitertEine(admin, r, summary, jobId, e);
}

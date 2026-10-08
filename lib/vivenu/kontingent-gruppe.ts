import type { CouponInput } from "@/lib/vivenu/client";

/**
 * Kontingent-Gruppen (PART-111, Konrad 05.10.: „nur ein Code, der einen Secret Shop öffnet“).
 *
 * Ein Kontingent (`org_ticket_allocation`) gilt je Organisation, Edition, **Kategorie** (Pass-Typ) und
 * Rabattstufe. Bis PART-111 bekam jedes Kontingent seinen eigenen Coupon, also eine Organisation mit
 * Partner- und Talent-Tickets zwei Codes für denselben Undershop. Jetzt bekommt eine **Gruppe** — alle
 * Kontingente einer Organisation und Edition mit derselben Rabattstufe — einen einzigen Coupon:
 *
 *  - `allowedTickets` ist die Vereinigung der Tickettypen aller aktiven Kontingente der Gruppe,
 *  - `maxTickets` ist die Summe ihrer Mengen,
 *  - `unlocks` zeigt auf den Undershop der Organisation,
 *  - Code und Coupon-Id stehen auf **allen** Zeilen der Gruppe.
 *
 * Die Menge je Kategorie hält der Undershop, nicht der Coupon: seine Zeilen tragen `amount` je Tickettyp.
 * Das belegt die Sandbox-Probe vom 08.10.2026 (`kontingent-probe`): bei einem Coupon, der mehr erlaubt,
 * als die Zeilen hergeben, wird ein Stück über der Zeile abgelehnt. 50-%-Kontingente bilden eine eigene
 * Gruppe, weil ein Coupon nur einen Rabattwert hat.
 *
 * Reine Funktionen ohne vivenu und Datenbank, damit der Lauf im Test mit echten Fällen läuft.
 */

/** Zeile aus `ticket_allocations_pending()` bzw. `ticket_allocations_of_orgs()`. */
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
  /** Rabattsatz in Prozent (0123): 100 = kostenlos, 50 = halber Preis. */
  discount_percent: number;
  status: string;
  coupon_code: string | null;
  vivenu_coupon_id: string | null;
  vivenu_undershop_id: string | null;
  org_undershop_id: string | null;
  ticket_type_ids: string[];
};

/** Die Gruppe, zu der ein Kontingent gehört. */
export function gruppenSchluessel(r: Pick<PendingAllocation, "org_id" | "edition_id" | "discount_percent">): string {
  return `${r.org_id}|${r.edition_id}|${r.discount_percent ?? 100}`;
}

/** Reihenfolge innerhalb einer Gruppe: aktive Coupons zuerst, dann nach Kategorie — damit die Wahl des Coupons nie vom Zufall der Abfrage abhängt. */
const STAND_RANG: Record<string, number> = { active: 0, pending_vivenu: 1, error: 2, disabled: 3 };
function nachStandUndKategorie(a: PendingAllocation, b: PendingAllocation): number {
  return (STAND_RANG[a.status] ?? 9) - (STAND_RANG[b.status] ?? 9) || a.pass_type.localeCompare(b.pass_type);
}

/** Die Kontingente nach Gruppen, in der Reihenfolge, in der die Gruppen zuerst vorkommen. */
export function gruppiere(rows: PendingAllocation[]): Map<string, PendingAllocation[]> {
  const gruppen = new Map<string, PendingAllocation[]>();
  for (const r of rows) {
    const k = gruppenSchluessel(r);
    gruppen.set(k, [...(gruppen.get(k) ?? []), r]);
  }
  return gruppen;
}

export type GruppenPlan = {
  /** Kontingente, die der Coupon deckt: nicht abgeschaltet und mit mindestens einem Tickettyp. */
  aktive: PendingAllocation[];
  /** Nicht abgeschaltet, aber ohne Tickettyp in `ticket_type_map`: Fehler an der Zeile, der Rest läuft weiter. */
  ohneTyp: PendingAllocation[];
  /** Abgeschaltete Kontingente (Menge 0, kein Produkt mehr). */
  abgeschaltet: PendingAllocation[];
  /** Vereinigung der Tickettypen der aktiven Kontingente, sortiert. */
  typen: string[];
  /** Summe der Mengen der aktiven Kontingente. */
  summe: number;
  /**
   * Der Coupon, der bleibt und erweitert wird: der erste vorhandene — aktive vor ausstehenden vor
   * fehlerhaften vor abgeschalteten, innerhalb davon nach Kategorie. `null`, wenn die Gruppe noch keinen hat
   * oder nichts mehr aktiv ist.
   */
  behalten: { couponId: string; code: string | null } | null;
  /** Ein von Hand gesetzter Code an einer Zeile ohne Coupon — er wird für einen neuen Coupon verwendet. */
  manuellerCode: string | null;
  /** Alle anderen Coupons der Gruppe: sie werden abgeschaltet. Ohne aktive Kontingente alle. */
  ueberzaehlige: string[];
  /** Zu jedem Coupon der Gruppe die erste Zeile, die ihn trug — für den Namen beim Abschalten und für das Protokoll. */
  besitzer: Map<string, PendingAllocation>;
};

/** Was für diese Gruppe zu tun ist — nur aus den Zeilen berechnet. */
export function planeGruppe(zeilen: PendingAllocation[]): GruppenPlan {
  const rows = [...zeilen].sort(nachStandUndKategorie);
  const abgeschaltet = rows.filter((r) => r.status === "disabled");
  const lebende = rows.filter((r) => r.status !== "disabled");
  const aktive = lebende.filter((r) => r.ticket_type_ids.length > 0);
  const ohneTyp = lebende.filter((r) => r.ticket_type_ids.length === 0);

  const typen = [...new Set(aktive.flatMap((r) => r.ticket_type_ids))].sort();
  const summe = aktive.reduce((s, r) => s + r.quantity, 0);

  const besitzer = new Map<string, PendingAllocation>();
  for (const r of rows) if (r.vivenu_coupon_id && !besitzer.has(r.vivenu_coupon_id)) besitzer.set(r.vivenu_coupon_id, r);
  const ersterMitCoupon = rows.find((r) => r.vivenu_coupon_id);

  const behalten =
    aktive.length > 0 && ersterMitCoupon
      ? { couponId: ersterMitCoupon.vivenu_coupon_id!, code: ersterMitCoupon.coupon_code }
      : null;
  const ueberzaehlige = [...besitzer.keys()].filter((id) => id !== behalten?.couponId);
  const manuellerCode = rows.find((r) => !r.vivenu_coupon_id && r.coupon_code)?.coupon_code ?? null;

  return { aktive, ohneTyp, abgeschaltet, typen, summe, behalten, manuellerCode, ueberzaehlige, besitzer };
}

/**
 * Ob eine Gruppe uneinheitlich ist: mehr als ein Coupon, oder ein Coupon neben Zeilen ohne. So sieht eine
 * Gruppe aus der Zeit je Kategorie aus. Der Lauf bringt sie auf einen Coupon, auch wenn keine Zeile mehr
 * aussteht — sonst bliebe jeder bestehende Partner bei mehreren Codes, bis sich zufällig eine Menge ändert.
 */
export function istUneinheitlich(zeilen: Pick<PendingAllocation, "status" | "vivenu_coupon_id">[]): boolean {
  const lebende = zeilen.filter((r) => r.status !== "disabled");
  const ids = new Set(lebende.map((r) => r.vivenu_coupon_id).filter((id): id is string => Boolean(id)));
  return ids.size > 1 || (ids.size === 1 && lebende.some((r) => !r.vivenu_coupon_id));
}

/** Der Name, unter dem der Coupon einer Gruppe in vivenu steht. Bei 100 % der des Undershops. */
export function gruppenCouponName(shopName: string, discountPercent: number): string {
  return discountPercent === 100 ? shopName : `${shopName} · ${discountPercent}%`;
}

/** Der Name eines abgelösten Coupons — er bleibt in vivenu stehen (Coupons lassen sich nicht löschen), abgeschaltet. */
export function abgeloestCouponName(shopName: string, r: Pick<PendingAllocation, "pass_type" | "discount_percent">): string {
  const satz = r.discount_percent === 100 ? "" : ` · ${r.discount_percent}%`;
  return `${shopName} · ${r.pass_type}${satz} · ersetzt`;
}

/**
 * Die Felder des Coupons einer Gruppe. Anlegen und Ändern setzen dieselben Werte, damit ein nachträglich
 * erhöhtes Kontingent nicht an einer alten Grenze hängen bleibt.
 *
 * `PUT /coupon/{id}` **ersetzt** den Coupon, es ist kein Patch: ohne `name` antwortet vivenu mit 400.
 * Jeder Aufruf schickt daher den vollen Satz mit.
 */
export function gruppenCouponFelder(
  eventId: string,
  underShopId: string,
  plan: Pick<GruppenPlan, "typen" | "summe">,
  discountPercent: number,
): Partial<CouponInput> {
  return {
    // `var` ist der prozentuale Rabatt, und der Wert ist ein **Anteil**: 1 = 100 %. Mit 100 zeigt der
    // Shop „-10000.00 %“ an und nimmt nichts mehr in den Korb (Sandbox, 12.09.).
    discountType: "var",
    discountValue: Math.min(1, Math.max(0, discountPercent / 100)),
    // Ohne die beiden `allowAll…: false` gälte der Coupon für alle Events und alle Tickettypen des Kontos.
    allowAllEvents: false,
    allowedEvents: [eventId],
    allowAllTickets: false,
    allowedTickets: plan.typen,
    unlocks: [{ target: "underShop", eventId, underShopId }],
    maxTickets: plan.summe,
    maxUsage: Math.max(1, plan.summe),
    singleUsage: false,
    active: true,
  };
}

/** Die Felder eines abgeschalteten Coupons: der volle Satz mit zugedrehten Grenzen, damit er wieder einzuschalten wäre. */
export function abgeschalteteFelder(
  eventId: string,
  underShopId: string,
  typen: string[],
  discountPercent: number,
): Partial<CouponInput> {
  return {
    ...gruppenCouponFelder(eventId, underShopId, { typen, summe: 0 }, discountPercent),
    active: false,
    maxTickets: 0,
    maxUsage: 0,
  };
}

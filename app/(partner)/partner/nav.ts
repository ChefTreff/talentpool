import type { PartnerProduct } from "./types";

/**
 * Was ein Partner im Menü sieht, folgt aus den gebuchten Leistungen — nicht
 * aus Rollen und nicht aus manuellen Freischaltungen (Arbeitsauftrag C,
 * „Produktbasiert statt Rollen").
 *
 * **Seit Migration 0110 steht die Zuordnung am Produkt** (`product.format_key`,
 * Vokabular `partner_format`) statt als SKU-Liste hier im Code. Der Grund ist
 * nicht Eleganz, sondern Zuständigkeit: welcher Artikel welche Seite öffnet,
 * weiß der Vertrieb, nicht der Code. Ein neuer Speaking-Artikel bekommt im
 * Produktstamm `format_key = 'talk'` und ist damit sofort wirksam — vorher
 * hätte er einen Deploy gebraucht. Die Konstante `STAGE_SKU` ist deshalb
 * entfallen.
 *
 * Zwei Punkte hängen weiterhin nicht am Produkt, sondern an dem, was daraus
 * entstanden ist (Review PR #14, Migration 0051): Bewerber gibt es, wenn der
 * Org eine Session zugeordnet wurde, Bühne, wenn ihr eine Bühne gehört. Über
 * Produkte allein ginge beides schief — eine Bühne kann das Team auch ohne
 * passendes Produkt zuweisen.
 */

export type PartnerNavKey =
  // Übersicht
  | "dashboard"
  | "wiki"
  // Euer Unternehmen
  | "onboarding"
  | "contacts"
  // Euer Summit — für jeden Partner, ohne Produktbindung
  | "checklist"
  | "files"
  | "tickets"
  | "eventapp"
  | "shop"
  | "media"
  // Eure Formate — nur bei gebuchtem Produkt (PART-042)
  | "booth"
  | "masterclass"
  | "company_tour"
  | "side_event"
  | "interview_table"
  | "hackathon"
  | "branding"
  | "talk"
  | "stage"
  | "applicants";

/**
 * Die Menügruppen der Seitenleiste (PART-042, Konrad 17.09.).
 *
 * „Eure Formate" ist **nur eine Menügruppe**, keine eigene Seite: sie bündelt,
 * was dieser Partner gebucht hat. Ein Partner ohne Formate sieht die
 * Überschrift gar nicht — eine leere Gruppe ist schlimmer als keine.
 */
export const NAV_GROUPS = {
  overview: ["dashboard", "wiki"],
  company: ["onboarding", "contacts"],
  summit: ["checklist", "files", "tickets", "eventapp", "shop", "media"],
  formats: [
    "booth",
    "masterclass",
    "company_tour",
    "side_event",
    "interview_table",
    "talk",
    "hackathon",
    "branding",
    "stage",
    "applicants",
  ],
} as const satisfies Record<string, readonly PartnerNavKey[]>;

/** Format-Schlüssel aus `product.format_key`, die zugleich Menüschlüssel sind. */
const FORMAT_KEYS = [
  "booth",
  "masterclass",
  "company_tour",
  "side_event",
  "interview_table",
  "hackathon",
  "branding",
  "talk",
  "stage",
] as const satisfies readonly PartnerNavKey[];

export type NavInput = {
  products: readonly PartnerProduct[];
  /** Sessions mit `host_org_id` = Org (Masterclass, Company Tour …). */
  sessions_count: number;
  /** Bühne mit `partner_org_id` = Org. */
  has_stage: boolean;
  /** Stand mit Nummer, Maßen oder Rückwand — aus `partner_overview.booth`. */
  has_booth: boolean;
  /**
   * Kontingente aus `partner_overview.ticket_allocations`. Das Team kann eins
   * auch ohne passendes Produkt eintragen — dann gehört der Menüpunkt trotzdem
   * hin (Kontrakt B5–B9).
   */
  has_allocations: boolean;
};

/**
 * Alle Menüpunkte, die dieser Org zustehen. Ob es die Seite schon gibt,
 * entscheidet der Aufrufer — hier geht es nur um die Berechtigung.
 */
export function visibleNavKeys(input: NavInput): PartnerNavKey[] {
  const keys: PartnerNavKey[] = [
    // Ohne Produktbindung: wer eine Org-Edition hat, hat auch ein Dashboard,
    // Stammdaten, Kontakte, Checkliste und Dateien.
    "dashboard",
    "onboarding",
    "contacts",
    "checklist",
    "files",
    // Die Event-App gilt für jeden Partner: jede Organisation steht in
    // Swapcard, und wer die Lead-Einstellung verpasst, kommt hinterher nicht
    // mehr an seine Kontakte. Den Punkt zu verstecken wäre teurer als ihn
    // jemandem zu zeigen, der ihn nicht braucht.
    "eventapp",
    // Marken-Material und Partnergrafik gelten für jeden Partner (PART-041).
    "media",
    // Das Wiki beantwortet, was ohnehin jeder fragt — keine Produktbindung.
    "wiki",
  ];
  if (input.has_allocations || input.products.some((p) => p.category === "tickets")) {
    keys.push("tickets");
  }

  // Formate aus `product.format_key` (Migration 0110). Ein Produkt ohne
  // Schlüssel öffnet keine Seite — Mobiliar und Technik gehören in den Shop,
  // nicht ins Menü.
  const booked = new Set(
    input.products.map((p) => p.format_key).filter((k): k is string => k != null),
  );
  for (const key of FORMAT_KEYS) {
    if (booked.has(key)) keys.push(key);
  }

  // Zwei Ausnahmen, in denen das Team etwas zugewiesen hat, ohne dass ein
  // passendes Produkt gebucht wäre.
  if (input.has_booth && !keys.includes("booth")) keys.push("booth");
  if (input.has_stage && !keys.includes("stage")) keys.push("stage");

  // Der Messeshop gehört zum Messestand (PART-037, Konrad 17.09.): er verkauft
  // Mobiliar, Technik und Gastronomie für die Standfläche. Als Stand zählen die
  // Standflächen-Pakete und die Standbühne, **nicht** der Hackathon-Stand — der
  // trägt `format_key = 'hackathon'` und fällt hier von selbst heraus.
  // Die Bestellungen sind ein Reiter **im** Shop, kein eigener Menüpunkt: sie
  // gehören dorthin, wo bestellt wird (Konrad, 14.09.).
  //
  // Das Menü ist dabei nur die Höflichkeit; die Sperre sitzt in den RPCs
  // (Migration 0112). Das Lunch-Paket bleibt für alle bestellbar — über die
  // Checkliste, nicht über den Katalog (PART-049).
  if (keys.includes("booth") || keys.includes("stage")) keys.push("shop");

  // Bewerber folgt der Session, nicht dem Produkt: erst wenn der Org ein
  // Format zugeordnet wurde, gibt es Bewerbungen zu entscheiden.
  if (input.sessions_count > 0) keys.push("applicants");
  return keys;
}

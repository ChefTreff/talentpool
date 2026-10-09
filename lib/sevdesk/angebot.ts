import { SEVDESK_IDS, euro } from "@/lib/sevdesk/mapping";
import { toRpcFailure } from "@/lib/rpc-error";

/**
 * Angebot aus dem Messeshop-Warenkorb (PART-116, K-81): die reine Zuordnung Warenkorb → SevDesk-Angebot und der Ablauf der Route mit austauschbaren
 * Abhängigkeiten — ohne Netz und ohne Datenbank im Node-Test prüfbar (wie `lib/sevdesk/mapping.ts` für die Rechnung). Die Anbindung an SevDesk und an Supabase
 * steht in `lib/sevdesk/angebot-server.ts`.
 *
 * **Wer schreibt wohin.** Die Datenbank hält den Zustand (`shop_quote_begin` sperrt den Warenkorb, `record_shop_quote` trägt den Beleg ein, `shop_quote_abort` gibt
 * ihn frei); SevDesk ist das Buchhaltungssystem, in dem das Angebot entsteht. Die Reihenfolge ist deshalb: erst sperren, dann SevDesk, dann eintragen. Scheitert etwas
 * vor dem Beleg in SevDesk, ist die Bestellung wieder frei; scheitert der Eintrag danach, steht ein Angebot ohne Referenz da — das ist selten, wird protokolliert,
 * und die Aufräumung gibt die Bestellung nach zehn Minuten frei (`shop_quotes_housekeeping`).
 *
 * **Schalter `SHOP_ANGEBOT_SEVDESK`** (`aus` | `probe` | `live`, Standard `aus`): ohne Konrads Ja gibt es keinen Schreibzugriff auf SevDesk.
 * - `aus`: Organisationen mit einer Kundennummer `ZZTEST…` bekommen einen **simulierten** Ablauf (kein SevDesk-Aufruf, Nummer `AN-PROBE-…`, als Probe gekennzeichnet);
 *   für alle anderen ist „Angebot erstellen“ nicht verfügbar (die Oberfläche sagt „beim Team anfragen“).
 * - `probe`: `ZZTEST…`-Organisationen bekommen in SevDesk einen **Entwurf** (Status 100, kein PDF, keine Festschreibung), der danach wieder gelöscht wird; sonst wie `aus`.
 * - `live`: wie `probe` für `ZZTEST…`; alle anderen bekommen ein echtes Angebot (festgeschrieben, mit PDF).
 */
export const ANGEBOT_TAGE = 30;

/** Kopftext der Standardfassung (K-81 Entscheidung 2; abgeleitet aus den Bestandsangeboten). */
export const KOPFTEXT =
  "Moin Moin! Wir freuen uns über eure Teilnahme am Future Leader Summit. In diesem Rahmen möchten wir folgende Leistungen aus dem Messeshop anbieten.";

/** Fußtext: die Gültigkeit steht hier, weil das Angebot in SevDesk kein `validUntil` trägt. `[%KONTAKTPERSON%]` ersetzt SevDesk. */
export function fusstext(gueltigBisDe: string): string {
  return (
    `Dieses Angebot ist ${ANGEBOT_TAGE} Tage gültig (bis ${gueltigBisDe}). Die verbindliche Bestellung gebt ihr im Partner-Portal unter Messeshop auf, ` +
    "mit eurer Bestellnummer (PO). Alle Preise netto zuzüglich gesetzlicher Umsatzsteuer.\n" +
    "Für Rückfragen stehen wir Ihnen jederzeit gerne zur Verfügung. Wir bedanken uns sehr für Ihr Vertrauen.\n" +
    "Mit freundlichen Grüßen\n[%KONTAKTPERSON%]"
  );
}

// ---- Daten ------------------------------------------------------------------------------------------------------------------------------

/** Was `shop_quote_begin` liefert (Migration `v6_shop_angebot`). */
export type AngebotGrundlage = {
  order_id: string;
  order_no: string | null;
  phase: number;
  po_number: string | null;
  org: {
    id: string;
    legal_name: string | null;
    communication_name: string | null;
    customer_number: string;
    sevdesk_contact_id: string | null;
    address_street: string | null;
    address_zip: string | null;
    address_city: string | null;
    address_country: string | null;
    address_extra: string | null;
    vat_id: string | null;
    invoice_email: string | null;
    invoice_name: string | null;
  };
  lines: {
    sku: string;
    name_de: string | null;
    name_en: string | null;
    unit: string | null;
    vat_rate: number | string | null;
    price_net_cents: number;
    qty: number | string;
    line_net_cents: number;
  }[];
  totals: { net_cents: number; vat_cents: number; gross_cents: number };
  lines_hash: string;
  quotes_used: number;
};

// ---- Datum ------------------------------------------------------------------------------------------------------------------------------

/** Das Berliner Kalenderdatum eines Zeitpunkts, `JJJJ-MM-TT`. */
export function berlinDatum(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** `JJJJ-MM-TT` → `TT.MM.JJJJ`. */
export function datumDe(iso: string): string {
  const [j, m, t] = iso.split("-");
  return `${t}.${m}.${j}`;
}

/** Das Datum, bis zu dem ein heute erstelltes Angebot gilt — Kalendertage in Berliner Zeit, wie die Datenbank (`now() + 30 Tage`) sie zählt. */
export function gueltigBis(heute: Date, tage: number = ANGEBOT_TAGE): { iso: string; de: string } {
  const [j, m, t] = berlinDatum(heute).split("-").map(Number);
  const ziel = new Date(Date.UTC(j, m - 1, t + tage));
  const iso = ziel.toISOString().slice(0, 10);
  return { iso, de: datumDe(iso) };
}

// ---- Schalter ---------------------------------------------------------------------------------------------------------------------------

export type AngebotModus = "aus" | "probe" | "live";

/** Aus dem Wert von `SHOP_ANGEBOT_SEVDESK`; alles andere als `probe` oder `live` heißt `aus`. */
export function angebotModus(wert: string | null | undefined): AngebotModus {
  const w = (wert ?? "").trim().toLowerCase();
  return w === "probe" || w === "live" ? w : "aus";
}

/** Kundennummern mit diesem Präfix gehören Testorganisationen (Konrads Konto): sie bekommen nie ein echtes Angebot. */
export function istProbeKunde(kundennummer: string | null | undefined): boolean {
  return /^zztest/i.test((kundennummer ?? "").trim());
}

export type Weg = "simuliert" | "sevdesk-probe" | "sevdesk-live" | "nicht-verfuegbar";

/**
 * Wohin ein Angebot geht. Ohne API-Token gibt es keinen SevDesk-Weg; eine Testorganisation fällt dann auf die Simulation zurück, damit Konrad den Ablauf
 * sieht, ohne dass jemand etwas freigeben muss.
 */
export function wegWaehlen(modus: AngebotModus, kundennummer: string | null | undefined, hatToken: boolean): Weg {
  if (istProbeKunde(kundennummer)) return modus === "aus" || !hatToken ? "simuliert" : "sevdesk-probe";
  if (modus === "live" && hatToken) return "sevdesk-live";
  return "nicht-verfuegbar";
}

export type Verfuegbarkeit =
  | { ok: true; weg: Exclude<Weg, "nicht-verfuegbar"> }
  | { ok: false; grund: "kundennummer" | "land" | "adresse" | "abgeschaltet" };

/** Deutschland in allen Schreibweisen, die die Datenbank (`shop_quote_begin`) als Deutschland gelten lässt; leer zählt als Deutschland. */
export function istDeutschland(land: string | null | undefined): boolean {
  const l = (land ?? "").trim().toUpperCase() || "DE";
  return l === "DE" || l === "DEUTSCHLAND" || l === "GERMANY";
}

/**
 * Zeigt die Oberfläche „Angebot erstellen“ oder „Angebot beim Team anfragen“? Dieselben Regeln wie `shop_quote_begin`, damit der Knopf nur dort steht, wo er durchgeht;
 * die Datenbank entscheidet am Ende trotzdem selbst.
 */
export function angebotVerfuegbar(a: {
  modus: AngebotModus;
  hatToken: boolean;
  kundennummer: string | null | undefined;
  land: string | null | undefined;
  strasse: string | null | undefined;
  plz: string | null | undefined;
  ort: string | null | undefined;
}): Verfuegbarkeit {
  if (!(a.kundennummer ?? "").trim()) return { ok: false, grund: "kundennummer" };
  if (!istDeutschland(a.land)) return { ok: false, grund: "land" };
  if (![a.strasse, a.plz, a.ort].every((x) => (x ?? "").trim() !== "")) return { ok: false, grund: "adresse" };
  const weg = wegWaehlen(a.modus, a.kundennummer, a.hatToken);
  return weg === "nicht-verfuegbar" ? { ok: false, grund: "abgeschaltet" } : { ok: true, weg };
}

// ---- Zuordnung Warenkorb → SevDesk-Angebot ------------------------------------------------------------------------------------------------

/** Adressblock wie auf der Rechnung: abweichende Firmierung statt Firmenname (PART-061), Zusatz unter der Straße (PART-059). */
export function angebotsAdresse(org: AngebotGrundlage["org"]): string {
  const name = org.invoice_name?.trim() || org.legal_name || org.communication_name;
  return [name, org.address_street, org.address_extra, [org.address_zip, org.address_city].filter(Boolean).join(" "), org.address_country]
    .map((v) => (v ?? "").toString().trim())
    .filter((v) => v !== "")
    .join("\n");
}

export type AngebotKontext = {
  contactId: string;
  contactPersonId: string;
  countryId: number;
  /** Die nächste freie Nummer (`AN-####`), die SevDesk meldet. */
  orderNumber: string;
  /** ISO-Datum JJJJ-MM-TT */
  orderDate: string;
  gueltig: { iso: string; de: string };
  /** SevDesk-Artikel je SKU, wo es einen gibt (Artikelstamm, `lib/sevdesk/parts.ts`); sonst steht nur der Name auf der Zeile. */
  partIds?: Record<string, string | null | undefined>;
};

/** Der Auftrag für `POST /Order/Factory/saveOrder`: Angebot (`AN`), Entwurf (Status 100), netto, Steuerregel 1 wie bei den Bestandsangeboten. */
export function buildQuotePayload(g: AngebotGrundlage, c: AngebotKontext) {
  const positions = g.lines.map((p, i) => {
    const part = c.partIds?.[p.sku];
    return {
      objectName: "OrderPos",
      mapAll: true,
      positionNumber: i,
      quantity: Number(p.qty),
      price: euro(p.price_net_cents),
      name: `${p.name_de ?? p.sku}`,
      text: `SKU ${p.sku}${p.unit && p.unit !== "piece" ? ` · Einheit ${p.unit}` : ""}`,
      unity: { id: SEVDESK_IDS.unityPiece, objectName: "Unity" },
      taxRate: Number(p.vat_rate ?? 7),
      ...(part ? { part: { id: part, objectName: "Part" } } : {}),
    };
  });
  return {
    order: {
      objectName: "Order",
      mapAll: true,
      orderType: "AN",
      orderNumber: c.orderNumber,
      orderDate: c.orderDate,
      status: 100,
      version: 0,
      currency: "EUR",
      showNet: true,
      smallSettlement: false,
      contact: { id: c.contactId, objectName: "Contact" },
      contactPerson: { id: c.contactPersonId, objectName: "SevUser" },
      header: `Angebot ${c.orderNumber}`,
      headText: KOPFTEXT,
      footText: fusstext(c.gueltig.de),
      address: angebotsAdresse(g.org),
      addressCountry: { id: c.countryId, objectName: "StaticCountry" },
      taxRule: { id: SEVDESK_IDS.taxRuleStandard, objectName: "TaxRule" },
      taxText: "Umsatzsteuer",
      taxRate: positions.length ? positions[0].taxRate : 7,
      customerInternalNote: `Portal: ${g.org.id} · ${g.order_no ?? g.order_id}${g.po_number ? ` · PO ${g.po_number}` : ""}`,
    },
    orderPosSave: positions,
    orderPosDelete: null,
  };
}

// ---- Fehler → HTTP ----------------------------------------------------------------------------------------------------------------------

/** HTTP-Status zu einem Fehlerschlüssel: Voraussetzung nicht erfüllt (422), Zustand passt nicht (409), kein Recht (403) … */
export function statusZuSchluessel(key: string): number {
  switch (key) {
    case "not_authenticated":
      return 401;
    case "not_allowed":
      return 403;
    case "not_found":
    case "order_not_found":
      return 404;
    case "order_quoted":
    case "not_editable":
    case "not_quoted":
    case "phase_closed":
    case "order_pending":
    case "quote_limit_reached":
    case "quote_in_progress":
      return 409;
    case "quote_unavailable":
      return 503;
    case "quote_failed":
    case "quote_contact_ambiguous":
      return 502;
    case "quote_record_failed":
      return 500;
    case "unknown":
      return 500;
    default:
      return 422;
  }
}

// ---- Ablauf ------------------------------------------------------------------------------------------------------------------------------

export type RpcFehler = { message?: string | null; code?: string | null; details?: string | null; hint?: string | null } | null;

export type AngebotAbhaengigkeiten = {
  modus: AngebotModus;
  hatToken: boolean;
  heute: () => Date;
  /** `shop_quote_begin` mit dem Sitzungs-Client der Partnerin. */
  begin(orderId: string): Promise<{ data: AngebotGrundlage | null; error: RpcFehler }>;
  /** `shop_quote_abort` mit dem Service-Client; Fehler dabei schluckt die Route (die Aufräumung gibt die Bestellung später frei). */
  abort(orderId: string, grund: string): Promise<void>;
  /** `record_shop_quote` mit dem Service-Client. */
  record(a: {
    orderId: string;
    sevdeskOrderId: string;
    nummer: string;
    contactId: string | null;
    netCents: number;
    linesHash: string;
    probe: boolean;
  }): Promise<{ error: RpcFehler }>;
  /** `shop_quote_info` mit dem Sitzungs-Client — die Gültigkeit, wie die Datenbank sie gesetzt hat. */
  gueltigkeit(orderId: string): Promise<string | null>;
  /** `integration.sync_error` für das Team (`record_sync_error`). */
  protokoll(a: { objectId: string; message: string; payload: Record<string, unknown> }): Promise<void>;
  sd: {
    kontakte(kundennummer: string): Promise<string[]>;
    kontaktAnlegen(a: {
      name: string;
      vatNumber: string | null;
      customerNumber: string;
      street: string | null;
      zip: string | null;
      city: string | null;
      country: string | null;
      email: string | null;
    }): Promise<string>;
    ansprechpartner(): Promise<string>;
    land(name: string | null): Promise<number>;
    artikel(sku: string): Promise<string | null>;
    naechsteNummer(): Promise<string>;
    angebotSpeichern(payload: unknown): Promise<{ id: string; orderNumber: string | null }>;
    angebotLoeschen(id: string): Promise<void>;
    /** `getPdf` schreibt den Beleg fest — der Abruf ist der Schritt „verbindlich“. */
    festschreiben(id: string): Promise<void>;
  };
};

export type AngebotErgebnis =
  | { ok: true; nummer: string; gueltigBis: string | null; probe: boolean; weg: Weg }
  | { ok: false; key: string; status: number; detail?: string };

const fehler = (key: string, detail?: string): AngebotErgebnis => ({ ok: false, key, status: statusZuSchluessel(key), ...(detail ? { detail } : {}) });

function meldung(e: unknown): { message: string; payload: Record<string, unknown> } {
  const message = e instanceof Error ? e.message : String(e);
  const s = e as { status?: unknown; path?: unknown };
  return { message: message.slice(0, 500), payload: typeof s?.status === "number" ? { status: s.status, path: s.path } : {} };
}

/**
 * Das Angebot erstellen: sperren → (SevDesk) → eintragen. `orderId` kommt von der Partnerin, ihr Recht prüft `shop_quote_begin`; alles Weitere hängt am Ergebnis dieses
 * ersten Schritts, nie am Request.
 */
export async function erstelleAngebot(dep: AngebotAbhaengigkeiten, orderId: string): Promise<AngebotErgebnis> {
  // 1 · Sperren. Scheitert das, ist nichts passiert.
  const start = await dep.begin(orderId);
  if (start.error || !start.data) {
    const f = toRpcFailure(start.error as Parameters<typeof toRpcFailure>[0]);
    return fehler(f.key, f.detail);
  }
  const g = start.data;
  // Die Bestellung freigeben — ein Fehler dabei darf den Ablauf nicht abbrechen (die Aufräumung gibt sie nach zehn Minuten ohnehin frei).
  const frei = (grund: string) => dep.abort(orderId, grund).catch(() => undefined);
  // Das Protokoll fürs Team ist Zugabe: scheitert es, bleibt die Antwort an die Partnerin trotzdem die richtige.
  const merke = (a: Parameters<AngebotAbhaengigkeiten["protokoll"]>[0]) => dep.protokoll(a).catch(() => undefined);
  const weg = wegWaehlen(dep.modus, g.org.customer_number, dep.hatToken);
  if (weg === "nicht-verfuegbar") {
    await frei("unavailable");
    return fehler("quote_unavailable");
  }
  const probe = weg !== "sevdesk-live";
  const gueltig = gueltigBis(dep.heute());

  // 2a · Simulation: kein Aufruf an SevDesk, die Datenbank bekommt trotzdem einen Beleg (als Probe gekennzeichnet).
  if (weg === "simuliert") {
    const nummer = `AN-PROBE-${String(g.quotes_used + 1).padStart(4, "0")}`;
    const rec = await dep.record({
      orderId, sevdeskOrderId: `SIM-${orderId}-${g.quotes_used + 1}`, nummer, contactId: null, netCents: g.totals.net_cents, linesHash: g.lines_hash, probe: true,
    });
    if (rec.error) {
      await frei("record_failed");
      const f = toRpcFailure(rec.error as Parameters<typeof toRpcFailure>[0]);
      return fehler(f.key === "unknown" ? "quote_record_failed" : f.key, f.detail);
    }
    return { ok: true, nummer, gueltigBis: await dep.gueltigkeit(orderId), probe: true, weg };
  }

  // 2b · SevDesk: Kontakt, Nummer, Entwurf — scheitert etwas, bevor das Angebot dort steht, ist die Bestellung wieder frei.
  let angelegt: { id: string; orderNumber: string | null } | null = null;
  let contactId: string | null = g.org.sevdesk_contact_id;
  try {
    if (!contactId) {
      const treffer = await dep.sd.kontakte(g.org.customer_number);
      if (treffer.length > 1) {
        // Zwei Kontakte auf einer Kundennummer: in SevDesk ist etwas durcheinander — nichts raten, nichts anlegen.
        await merke({ objectId: g.org.id, message: `Zwei SevDesk-Kontakte zur Kundennummer ${g.org.customer_number}`, payload: { orders: [g.order_no], contacts: treffer } });
        await frei("contact_ambiguous");
        return fehler("quote_contact_ambiguous");
      }
      contactId =
        treffer[0] ??
        (await dep.sd.kontaktAnlegen({
          name: g.org.invoice_name?.trim() || g.org.legal_name || g.org.communication_name || "Partner",
          vatNumber: g.org.vat_id,
          customerNumber: g.org.customer_number,
          street: g.org.address_street,
          zip: g.org.address_zip,
          city: g.org.address_city,
          country: g.org.address_country,
          email: g.org.invoice_email,
        }));
    }
    const [contactPersonId, countryId, orderNumber, artikel] = await Promise.all([
      dep.sd.ansprechpartner(),
      dep.sd.land(g.org.address_country),
      dep.sd.naechsteNummer(),
      Promise.all(g.lines.map(async (l) => [l.sku, await dep.sd.artikel(l.sku).catch(() => null)] as const)),
    ]);
    const payload = buildQuotePayload(g, {
      contactId, contactPersonId, countryId, orderNumber, orderDate: berlinDatum(dep.heute()), gueltig: gueltig, partIds: Object.fromEntries(artikel),
    });
    angelegt = await dep.sd.angebotSpeichern(payload);
    // Live: festschreiben (getPdf) — erst jetzt ist das Angebot verbindlich und hat seine Nummer sicher.
    if (weg === "sevdesk-live") await dep.sd.festschreiben(angelegt.id);
  } catch (e) {
    const m = meldung(e);
    // Steht der Entwurf schon da, aber nicht festgeschrieben, räumen wir ihn weg; gelingt das nicht, sieht das Team die Nummer im Protokoll.
    let geloescht = angelegt === null;
    if (angelegt) geloescht = await dep.sd.angebotLoeschen(angelegt.id).then(() => true, () => false);
    await merke({
      objectId: orderId,
      message: m.message,
      payload: { ...m.payload, order: g.order_no, ...(angelegt ? { sevdesk_order_id: angelegt.id, draft_removed: geloescht } : {}) },
    });
    await frei("sevdesk_failed");
    return fehler("quote_failed");
  }

  // 3 · Eintragen. Live steht das Angebot jetzt fest in SevDesk; scheitert der Eintrag, bleibt es dort ohne Referenz (selten, protokolliert, die Aufräumung gibt die Bestellung frei).
  const nummer = angelegt.orderNumber ?? `AN-${angelegt.id}`;
  const rec = await dep.record({
    orderId, sevdeskOrderId: angelegt.id, nummer, contactId, netCents: g.totals.net_cents, linesHash: g.lines_hash, probe,
  });
  if (rec.error) {
    if (probe) await dep.sd.angebotLoeschen(angelegt.id).catch(() => undefined);
    await merke({
      objectId: orderId,
      message: `record_shop_quote: ${rec.error.message ?? "Fehler"}`,
      payload: { order: g.order_no, sevdesk_order_id: angelegt.id, number: nummer, probe, draft_removed: probe },
    });
    if (probe) await frei("record_failed");
    const f = toRpcFailure(rec.error as Parameters<typeof toRpcFailure>[0]);
    return fehler(f.key === "unknown" || f.key === "not_allowed" ? "quote_record_failed" : f.key, f.detail);
  }
  // Der Probe-Entwurf in SevDesk hat seinen Zweck erfüllt (der Weg bis dahin ist erprobt); der Beleg bei uns bleibt, als Probe gekennzeichnet.
  if (probe) {
    await dep.sd.angebotLoeschen(angelegt.id).catch((e) =>
      merke({ objectId: orderId, message: `Probe-Entwurf nicht gelöscht: ${meldung(e).message}`, payload: { sevdesk_order_id: angelegt?.id, order: g.order_no } }),
    );
  }
  return { ok: true, nummer, gueltigBis: await dep.gueltigkeit(orderId), probe, weg };
}

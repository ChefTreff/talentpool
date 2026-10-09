import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  addContactAddress,
  addContactEmail,
  createContact,
  deleteOrderDraft,
  findContactIdsByCustomerNumber,
  getContactPersonId,
  getCountryId,
  getNextQuoteNumber,
  hasSevdeskToken,
  saveOrderDraft,
} from "@/lib/sevdesk/client";
import { downloadPdf } from "@/lib/sevdesk/documents";
import { findSevdeskPart } from "@/lib/sevdesk/parts";
import { angebotModus, type AngebotAbhaengigkeiten, type AngebotGrundlage } from "@/lib/sevdesk/angebot";

/**
 * Die echten Abhängigkeiten für `erstelleAngebot` (PART-116): Datenbank und SevDesk.
 *
 * - `supabase` ist der **Sitzungs-Client der Partnerin**: `shop_quote_begin` und `shop_quote_info` prüfen ihr Recht selbst, die Organisation kommt nie aus dem Request.
 * - `admin` (`service_role`) nur für das, was die Datenbank allein der Route erlaubt: `record_shop_quote`, `shop_quote_abort` und das Protokoll fürs Team.
 * - Der Schalter `SHOP_ANGEBOT_SEVDESK` (`aus` | `probe` | `live`) wird hier gelesen, nirgends sonst — und die Oberfläche fragt `angebotModus` mit demselben Wert.
 */
export function angebotAbhaengigkeiten(c: { supabase: SupabaseClient; admin: SupabaseClient }): AngebotAbhaengigkeiten {
  return {
    modus: angebotModus(process.env.SHOP_ANGEBOT_SEVDESK),
    hatToken: hasSevdeskToken(),
    heute: () => new Date(),
    async begin(orderId) {
      const { data, error } = await c.supabase.rpc("shop_quote_begin", { p_order_id: orderId });
      return { data: (data ?? null) as AngebotGrundlage | null, error };
    },
    async abort(orderId, grund) {
      await c.admin.rpc("shop_quote_abort", { p_order_id: orderId, p_reason: grund });
    },
    async record(a) {
      const { error } = await c.admin.rpc("record_shop_quote", {
        p_order_id: a.orderId,
        p_sevdesk_order_id: a.sevdeskOrderId,
        p_number: a.nummer,
        p_contact_id: a.contactId,
        p_net_cents: a.netCents,
        p_lines_hash: a.linesHash,
        p_probe: a.probe,
      });
      return { error };
    },
    async gueltigkeit(orderId) {
      const { data } = await c.supabase.rpc("shop_quote_info", { p_order_id: orderId });
      return (data as { valid_until?: string | null } | null)?.valid_until ?? null;
    },
    async protokoll(a) {
      await c.admin.rpc("record_sync_error", {
        p_job_id: null,
        p_object_type: "shop_quote",
        p_object_id: a.objectId,
        p_message: a.message.slice(0, 500),
        p_payload: a.payload,
      });
    },
    sd: {
      kontakte: findContactIdsByCustomerNumber,
      async kontaktAnlegen(a) {
        const id = await createContact({ name: a.name, vatNumber: a.vatNumber, customerNumber: a.customerNumber });
        const countryId = await getCountryId(a.country);
        await addContactAddress(id, { street: a.street, zip: a.zip, city: a.city, countryId });
        if (a.email) await addContactEmail(id, a.email);
        return id;
      },
      ansprechpartner: getContactPersonId,
      land: getCountryId,
      artikel: findSevdeskPart,
      naechsteNummer: getNextQuoteNumber,
      angebotSpeichern: saveOrderDraft,
      angebotLoeschen: deleteOrderDraft,
      async festschreiben(id) {
        await downloadPdf({ kind: "offer", id, nummer: null, datum: null });
      },
    },
  };
}

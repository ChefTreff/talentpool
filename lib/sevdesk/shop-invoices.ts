import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SevdeskError, addContactAddress, addContactEmail, createContact, getContactPersonId, getCountryId, hasSevdeskToken, saveInvoiceDraft } from "@/lib/sevdesk/client";
import { buildInvoicePayload, type InvoiceCandidate } from "@/lib/sevdesk/mapping";

export type InvoiceRun = {
  org_id: string;
  org: string;
  orders: string[];
  net_cents: number;
  outcome: "dry-run" | "created" | "error";
  invoice_id?: string;
  invoice_number?: string | null;
  contact_id?: string;
  detail?: string;
};

export type InvoiceSummary = {
  dryRun: boolean;
  candidates: number;
  created: number;
  errors: number;
  skipped?: string;
  runs: InvoiceRun[];
};

/**
 * Rechnungsentwürfe (Status 100) je Partner aus allen abgeschlossenen Shop-Bestellungen ohne Referenz.
 * `supabase` ist der Session-Client des Teammitglieds (die RPCs prüfen `is_partner_team()`), `admin` nur für das Sync-Protokoll.
 * Ein zweiter Lauf legt nichts doppelt an: `record_shop_invoice` merkt sich je Bestellung die Rechnung, und die Kandidatenliste blendet sie aus.
 */
export async function createShopInvoiceDrafts(input: {
  supabase: SupabaseClient;
  admin: SupabaseClient;
  editionId: string;
  editionLabel: string;
  deliveryDate: string;
  dryRun: boolean;
  orgId?: string;
  jobId: number | null;
}): Promise<InvoiceSummary> {
  const { data, error } = await input.supabase.rpc("shop_invoice_candidates", { p_edition_id: input.editionId });
  if (error) throw new Error(`shop_invoice_candidates: ${error.message}`);
  let candidates = (data ?? []) as InvoiceCandidate[];
  if (input.orgId) candidates = candidates.filter((c) => c.org_id === input.orgId);
  const summary: InvoiceSummary = { dryRun: input.dryRun, candidates: candidates.length, created: 0, errors: 0, runs: [] };
  if (candidates.length === 0) return summary;

  if (input.dryRun || !hasSevdeskToken()) {
    if (!input.dryRun) summary.skipped = "SEVDESK_API_TOKEN fehlt – nur Vorschau";
    summary.dryRun = true;
    summary.runs = candidates.map((c) => ({ org_id: c.org_id, org: c.communication_name ?? c.legal_name ?? "–", orders: c.order_nos, net_cents: c.net_cents, outcome: "dry-run" }));
    return summary;
  }

  const contactPersonId = await getContactPersonId();
  const invoiceDate = new Date().toISOString().slice(0, 10);
  for (const c of candidates) {
    const name = c.communication_name ?? c.legal_name ?? "Partner";
    try {
      const countryId = await getCountryId(c.address_country);
      let contactId = c.sevdesk_contact_id;
      if (!contactId) {
        contactId = await createContact({ name: c.legal_name ?? name, vatNumber: c.vat_id });
        await input.supabase.rpc("set_org_sevdesk_contact", { p_org_id: c.org_id, p_contact_id: contactId });
        await addContactAddress(contactId, { street: c.address_street, zip: c.address_zip, city: c.address_city, countryId });
        if (c.invoice_email) await addContactEmail(contactId, c.invoice_email);
      }
      const payload = buildInvoicePayload(c, {
        contactId, contactPersonId, countryId, invoiceDate, deliveryDate: input.deliveryDate, editionLabel: input.editionLabel,
        costCentreId: process.env.SEVDESK_COST_CENTRE_ID?.trim() || null,
      });
      const draft = await saveInvoiceDraft(payload);
      const { error: recErr } = await input.supabase.rpc("record_shop_invoice", {
        p_org_id: c.org_id, p_order_ids: c.order_ids, p_sevdesk_invoice_id: draft.id, p_sevdesk_contact_id: contactId,
        p_meta: { invoice_number: draft.invoiceNumber, net_cents: c.net_cents },
      });
      if (recErr) throw new Error(`record_shop_invoice: ${recErr.message} (Entwurf ${draft.id} existiert in SevDesk!)`);
      summary.created += 1;
      summary.runs.push({ org_id: c.org_id, org: name, orders: c.order_nos, net_cents: c.net_cents, outcome: "created", invoice_id: draft.id, invoice_number: draft.invoiceNumber, contact_id: contactId });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      summary.errors += 1;
      summary.runs.push({ org_id: c.org_id, org: name, orders: c.order_nos, net_cents: c.net_cents, outcome: "error", detail: message.slice(0, 300) });
      await input.admin.rpc("record_sync_error", {
        p_job_id: input.jobId, p_object_type: "shop_invoice", p_object_id: c.org_id, p_message: message.slice(0, 500),
        p_payload: e instanceof SevdeskError ? { status: e.status, path: e.path, orders: c.order_nos } : { orders: c.order_nos },
      });
    }
  }
  return summary;
}

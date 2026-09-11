import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  associatedIds,
  getCompany,
  getContactLabels,
  getContacts,
  getDeal,
  getLineItems,
  getOwner,
  getPortalId,
  previousStage,
  setDealStage,
} from "@/lib/hubspot/client";
import { buildIngestPayload } from "@/lib/hubspot/mapping";
import { notifyOnboardingChannel } from "@/lib/hubspot/notify";
import type { IngestPayload, IngestResult } from "@/lib/hubspot/types";

export type DealRun = {
  dealId: string;
  outcome: "ingested" | "already" | "gate_failed";
  result: IngestResult;
  payload?: IngestPayload;
  stageReset?: boolean;
  /** Nach gelungenem Ingest in die Erfolgs-Phase der Edition geschoben (`event.hubspot_done_stage_id`, 0058). */
  stageDone?: boolean;
  slack?: "sent" | "skipped" | "failed";
};

/**
 * Einen Deal verarbeiten: HubSpot lesen → Payload → `ingest_partner_deal` (service_role).
 * Die Entscheidung trifft die Datenbank (Gate, Idempotenz, Mail an den Owner). Hier passiert
 * nur, was außerhalb der Datenbank liegt: Deal-Phase zurücksetzen und Slack benachrichtigen.
 * Ausnahmen (HubSpot nicht erreichbar, RPC-Fehler) gehen an den Aufrufer, der sie als
 * `failed`/Sync-Fehler protokolliert.
 */
export async function ingestDeal(
  admin: SupabaseClient,
  dealId: string,
  opts: { portalId?: string | null; jobId?: number | null; resetStage?: boolean } = {},
): Promise<DealRun> {
  const { data: done } = await admin.rpc("hubspot_deals_ingested", { p_deal_ids: [dealId] });
  if (Array.isArray(done) && done.includes(dealId)) {
    return { dealId, outcome: "already", result: { ok: true, already: true, org_id: "", org_edition_id: "" } };
  }

  const deal = await getDeal(dealId);
  const companyId = associatedIds(deal, "companies")[0] ?? null;
  const contactIds = associatedIds(deal, "contacts");
  const lineItemIds = associatedIds(deal, "line_items");

  const [company, contacts, labels, lineItems, owner, portalId] = await Promise.all([
    companyId ? getCompany(companyId) : Promise.resolve(null),
    getContacts(contactIds),
    contactIds.length ? getContactLabels(dealId) : Promise.resolve(new Map<string, string[]>()),
    getLineItems(lineItemIds),
    getOwner(deal.properties.hubspot_owner_id),
    opts.portalId ? Promise.resolve(opts.portalId) : getPortalId(),
  ]);

  const payload = buildIngestPayload({
    deal: { id: String(deal.id), properties: deal.properties },
    company: company ? { id: String(company.id), properties: company.properties } : null,
    contacts: contacts.map((c) => ({ id: String(c.id), properties: c.properties, labels: labels.get(String(c.id)) ?? [] })),
    lineItems: lineItems.map((li) => ({ id: String(li.id), properties: li.properties })),
    owner,
    portalId,
  });
  if (opts.jobId != null) payload.job_id = opts.jobId;

  const { data, error } = await admin.rpc("ingest_partner_deal", { p: payload });
  if (error) throw new Error(`ingest_partner_deal: ${error.message}`);
  const result = data as IngestResult;

  if (result.ok) {
    const stageDone = result.already ? false : await advanceToDoneStage(admin, dealId, payload);
    return { dealId, outcome: result.already ? "already" : "ingested", result, payload, stageDone };
  }

  // Gate-Fehler: Phase zurück auf den vorherigen Stand, Slack informieren. Die Mail an den
  // Deal-Owner (Fallback area_lead_partner) hat die Datenbank schon in die Warteschlange gelegt.
  let stageReset = false;
  if (opts.resetStage !== false) {
    const prev = previousStage(deal, payload.deal.stage);
    if (prev) {
      try {
        await setDealStage(dealId, prev);
        stageReset = true;
      } catch (e) {
        console.error(`[hubspot] Phase für Deal ${dealId} nicht zurückgesetzt:`, e instanceof Error ? e.message : e);
      }
    }
  }
  const company_name = payload.company.communication_name ?? payload.company.legal_name ?? "–";
  const slack = await notifyOnboardingChannel(
    `HubSpot-Deal nicht übernommen: ${payload.deal.name ?? dealId} (${company_name}) — ${result.errors.join(", ")}${payload.deal.url ? `\n${payload.deal.url}` : ""}`,
    { deal_id: dealId, errors: result.errors, owner_email: payload.deal.owner_email, stage_reset: stageReset },
  );
  return { dealId, outcome: "gate_failed", result, payload, stageReset, slack };
}

/**
 * Erfolgs-Phase (Entscheidung Konrad 11.09.): nach gelungenem Ingest wandert der Deal in `event.hubspot_done_stage_id` der Edition
 * seiner Pipeline, etwa „Onboarding Operations (Automation Complete)“. Ohne Eintrag passiert nichts; ein Fehler dabei kippt den Ingest nicht.
 */
async function advanceToDoneStage(admin: SupabaseClient, dealId: string, payload: IngestPayload): Promise<boolean> {
  const { data } = await admin.rpc("hubspot_editions");
  const editions = (data ?? []) as { pipeline_id: string; stage_id: string; done_stage_id: string | null }[];
  const edition = editions.find((e) => e.pipeline_id === payload.deal.pipeline);
  if (!edition?.done_stage_id || payload.deal.stage === edition.done_stage_id) return false;
  try {
    await setDealStage(dealId, edition.done_stage_id);
    return true;
  } catch (e) {
    console.error(`[hubspot] Deal ${dealId} nicht in die Erfolgs-Phase geschoben:`, e instanceof Error ? e.message : e);
    return false;
  }
}

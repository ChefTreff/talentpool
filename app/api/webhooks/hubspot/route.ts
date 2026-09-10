import { NextResponse, after } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { verifyHubspotSignature } from "@/lib/hubspot/signature";
import { ingestDeal } from "@/lib/hubspot/ingest";
import type { HubspotWebhookEvent } from "@/lib/hubspot/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * HubSpot-Webhook (Welle 3 A2): Subscription `deal.propertyChange` auf `dealstage`.
 *
 * 1. Signatur v3 mit `HUBSPOT_CLIENT_SECRET` prüfen — sonst 401 ohne jede Verarbeitung.
 * 2. Jedes Ereignis in `integration.webhook_event` festhalten (idempotent je Event-ID);
 *    Duplikate enden hier.
 * 3. Sofort antworten, dann verarbeiten (`after`): nur Ereignisse, deren neue Phase die
 *    „Onboarding Automation“-Phase einer Edition ist (`hubspot_editions`). Alles andere `ignored`.
 * Kein Nutzerkontext: service_role nach der Signaturprüfung; die Route ist im Proxy öffentlich
 * und schützt sich selbst. Was fehlt, holt der nächtliche Sweep nach.
 */
export async function POST(request: Request) {
  const body = await request.text();
  const verdict = verifyHubspotSignature({
    method: "POST",
    url: request.url,
    body,
    timestamp: request.headers.get("x-hubspot-request-timestamp"),
    signature: request.headers.get("x-hubspot-signature-v3"),
    secret: process.env.HUBSPOT_CLIENT_SECRET,
  });
  if (!verdict.ok) {
    console.warn(`[hubspot] Webhook abgelehnt: ${verdict.reason}`);
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let events: HubspotWebhookEvent[];
  try {
    const parsed: unknown = JSON.parse(body);
    events = Array.isArray(parsed) ? (parsed as HubspotWebhookEvent[]) : [parsed as HubspotWebhookEvent];
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: editions } = await admin.rpc("hubspot_editions");
  const stageIds = new Set(((editions ?? []) as { stage_id: string }[]).map((e) => e.stage_id));

  const queue: { recordId: number; dealId: string; portalId: string | null }[] = [];
  const accepted: { eventId: string; status: string }[] = [];

  for (const ev of events.slice(0, 100)) {
    const eventId = ev.eventId != null ? String(ev.eventId) : "";
    const dealId = ev.objectId != null ? String(ev.objectId) : "";
    const { data: rec, error } = await admin.rpc("record_webhook_event", {
      p_source: "hubspot",
      p_event_type: ev.subscriptionType ?? "unknown",
      p_external_id: eventId || null,
      p_payload: ev,
      p_headers: {
        timestamp: request.headers.get("x-hubspot-request-timestamp"),
        attempt: ev.attemptNumber ?? null,
      },
      p_signature_valid: true,
    });
    if (error || !rec) {
      console.error("[hubspot] record_webhook_event fehlgeschlagen:", error?.message);
      accepted.push({ eventId, status: "not_recorded" });
      continue;
    }
    const { id: recordId, duplicate } = rec as { id: number; duplicate: boolean };
    if (duplicate) {
      accepted.push({ eventId, status: "duplicate" });
      continue;
    }
    const relevant =
      ev.subscriptionType === "deal.propertyChange" &&
      ev.propertyName === "dealstage" &&
      dealId !== "" &&
      stageIds.has(String(ev.propertyValue));
    if (!relevant) {
      await admin.rpc("finish_webhook_event", { p_id: recordId, p_status: "ignored" });
      accepted.push({ eventId, status: "ignored" });
      continue;
    }
    queue.push({ recordId, dealId, portalId: ev.portalId != null ? String(ev.portalId) : null });
    accepted.push({ eventId, status: "queued" });
  }

  if (queue.length > 0) {
    after(async () => {
      for (const item of queue) {
        try {
          const run = await ingestDeal(admin, item.dealId, { portalId: item.portalId });
          await admin.rpc("finish_webhook_event", {
            p_id: item.recordId,
            p_status: "processed",
            p_error: run.outcome === "gate_failed" && !run.result.ok ? run.result.errors.join(", ") : null,
            p_related_type: run.result.ok && run.result.org_edition_id ? "org_edition" : null,
            p_related_id: run.result.ok && run.result.org_edition_id ? run.result.org_edition_id : null,
          });
          console.info(`[hubspot] Deal ${item.dealId}: ${run.outcome}`);
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          console.error(`[hubspot] Deal ${item.dealId} fehlgeschlagen:`, message);
          await admin.rpc("finish_webhook_event", { p_id: item.recordId, p_status: "failed", p_error: message.slice(0, 500) });
        }
      }
    });
  }

  return NextResponse.json({ ok: true, events: accepted });
}

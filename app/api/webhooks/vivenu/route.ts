import { NextResponse, after } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { verifyVivenuSignature } from "@/lib/vivenu/signature";
import {
  isIngestable,
  TICKET_EVENTS,
  ticketsOf,
  toIngestPayload,
  webhookId,
  webhookType,
  type VivenuWebhook,
} from "@/lib/vivenu/tickets";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * vivenu-Webhook (Welle 4, PR 23).
 *
 * 1. **Raw-Body** prüfen, bevor irgendetwas geparst wird — vivenu hasht den
 *    Rohtext (Antwort 11.09.). Ohne gültige Signatur 401 und keine Verarbeitung.
 * 2. Ereignis in `integration.webhook_event` festhalten; die Webhook-Id macht
 *    das idempotent. vivenu versucht es bis zu **siebenmal** — Duplikate enden hier.
 * 3. Sofort antworten, dann verarbeiten (`after`): jedes Ticket über
 *    `ingest_vivenu_ticket`. Auch das ist idempotent (Upsert je vivenu-Ticket-Id,
 *    Einlösungen werden neu gezählt statt hochgezählt).
 *
 * Kein Nutzerkontext: service_role erst nach der Signaturprüfung. Die Route ist
 * im Proxy öffentlich und schützt sich selbst.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const verdict = verifyVivenuSignature({
    rawBody,
    signature: request.headers.get("x-vivenu-signature"),
    secret: process.env.VIVENU_WEBHOOK_SECRET,
  });
  if (!verdict.ok) {
    console.warn(`[vivenu] Webhook abgelehnt: ${verdict.reason}`);
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let hook: VivenuWebhook;
  try {
    hook = JSON.parse(rawBody) as VivenuWebhook;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const type = webhookType(hook);
  const id = webhookId(hook);
  const admin = createSupabaseAdminClient();

  const { data: rec, error } = await admin.rpc("record_webhook_event", {
    p_source: "vivenu",
    p_event_type: type,
    p_external_id: id,
    p_payload: hook as unknown as Record<string, unknown>,
    p_headers: { signature_encoding: verdict.encoding },
    p_signature_valid: true,
  });
  if (error || !rec) {
    console.error("[vivenu] record_webhook_event fehlgeschlagen:", error?.message);
    // 500 heisst für vivenu „nochmal versuchen" — genau richtig, wenn wir
    // das Ereignis nicht einmal festhalten konnten.
    return NextResponse.json({ error: "not recorded" }, { status: 500 });
  }
  const { id: recordId, duplicate } = rec as { id: number; duplicate: boolean };
  if (duplicate) return NextResponse.json({ ok: true, status: "duplicate" });

  if (!(TICKET_EVENTS as readonly string[]).includes(type)) {
    await admin.rpc("finish_webhook_event", { p_id: recordId, p_status: "ignored" });
    return NextResponse.json({ ok: true, status: "ignored" });
  }

  const tickets = ticketsOf(hook.data ?? hook).filter(isIngestable);

  after(async () => {
    const outcomes: string[] = [];
    // Unbekannte Tickettypen einmal je Typ melden, nicht je Ticket: bei einer
    // Bestellung mit 50 gleichen Tickets sonst 50 identische Fehlerzeilen.
    const unknownTypes = new Set<string>();
    try {
      for (const ticket of tickets) {
        const { data, error: rpcError } = await admin.rpc("ingest_vivenu_ticket", {
          p_data: toIngestPayload(ticket),
        });
        if (rpcError) throw rpcError;
        const result = data as { outcome?: string; ticket_type_id?: string; pass_type_missing?: boolean } | null;
        outcomes.push(String(result?.outcome ?? "unknown"));
        if (result?.pass_type_missing && result.ticket_type_id) unknownTypes.add(result.ticket_type_id);
      }
      for (const ticketTypeId of unknownTypes) {
        await admin.rpc("record_sync_error", {
          p_job_id: null,
          p_object_type: "vivenu_ticket_type",
          p_object_id: ticketTypeId,
          p_message: `Tickettyp ${ticketTypeId} fehlt in ticket_type_map — Pass-Typ bleibt leer, Nachtrag über den Sweep.`,
          p_payload: { ticket_type_id: ticketTypeId },
        });
      }
      await admin.rpc("finish_webhook_event", {
        p_id: recordId,
        p_status: tickets.length === 0 ? "ignored" : "processed",
        p_error: null,
      });
      if (outcomes.length > 0) console.info(`[vivenu] ${type}: ${outcomes.join(", ")}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await admin.rpc("finish_webhook_event", {
        p_id: recordId,
        p_status: "error",
        p_error: message.slice(0, 500),
      });
      console.error("[vivenu] Verarbeitung fehlgeschlagen:", message);
    }
  });

  return NextResponse.json({ ok: true, status: "accepted", tickets: tickets.length });
}

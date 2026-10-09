import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { VivenuError, getEvent, hasVivenuKey, vv } from "@/lib/vivenu/client";
import { ticketsOf, toIngestPayload } from "@/lib/vivenu/tickets";
import {
  gleicheAdresse,
  gueltigeTransaktion,
  kaeuferAdresse,
  ladeSchluessel,
  ohneSecret,
  personalisierungsRumpf,
  rueckschreibenAn,
  ticketAusTransaktion,
  type DataField,
} from "@/lib/vivenu/bestaetigung";

/**
 * Server-Teil der Ticket-Bestätigung (TAL-019). Beide Wege laufen mit dem Service-Client — der Aufrufer hat vorher geprüft,
 * dass die angemeldete Person Käufer ist (Transaktion laden) bzw. die Datenbank die Personalisierung erlaubt hat.
 */

export type LadeErgebnis = "ok" | "fremd" | "nicht_gefunden" | "gedrosselt" | "ohne_schluessel" | "fehler";

/**
 * „Der Webhook ist noch nicht da“: die Transaktion bei vivenu laden und über **denselben** `ingest_vivenu_ticket`
 * schreiben. **Vor** dem Schreiben wird die Käufer-Adresse gegen die Anmelde-Adresse geprüft — stimmt sie nicht, wird
 * nichts geschrieben und der Aufrufer zeigt eine neutrale Meldung. Höchstens ein Versuch je Transaktion und Minute.
 */
export async function ladeTransaktion(
  admin: SupabaseClient,
  transaktion: string,
  anmeldeAdresse: string | null | undefined,
): Promise<LadeErgebnis> {
  const id = gueltigeTransaktion(transaktion);
  if (!id) return "nicht_gefunden";
  if (!hasVivenuKey()) return "ohne_schluessel";
  const { data: rec } = await admin.rpc("record_webhook_event", {
    p_source: "vivenu_tx_load",
    p_event_type: "load",
    p_external_id: ladeSchluessel(id, Date.now()),
    p_payload: {},
  });
  if ((rec as { duplicate?: boolean } | null)?.duplicate) return "gedrosselt";
  try {
    const tx = await vv<unknown>(`/transactions/${encodeURIComponent(id)}`);
    if (!gleicheAdresse(kaeuferAdresse(tx), anmeldeAdresse)) return "fremd";
    let tickets = ticketsOf(tx);
    if (tickets.length === 0) tickets = ticketsOf(await vv<unknown>(`/transactions/${encodeURIComponent(id)}/tickets`));
    for (const t of tickets) {
      const teil = ticketAusTransaktion(t as Record<string, unknown>, tx, id);
      if (typeof teil._id !== "string" || typeof teil.eventId !== "string") continue;
      const { error } = await admin.rpc("ingest_vivenu_ticket", { p_data: toIngestPayload(teil as never, { transactionId: id }) });
      if (error) {
        console.error("[bestaetigung] ingest:", error.code, error.message);
        return "fehler";
      }
    }
    return "ok";
  } catch (e) {
    if (e instanceof VivenuError && e.status === 404) return "nicht_gefunden";
    console.error("[bestaetigung] Transaktion laden:", e instanceof Error ? e.message.slice(0, 200) : "Fehler");
    return "fehler";
  }
}

export type RueckErgebnis = "ok" | "aus" | "fehler" | "ohne_secret";

/**
 * Badge-Angaben nach vivenu zurückschreiben (`POST /tickets/personalize/{id}/{secret}`). Das Secret verlässt den Server nie
 * und steht in keiner Meldung. Schalter `VIVENU_WRITE_ENABLED` (Standard aus): dann nur die Marke setzen. Bei jedem Fehler
 * bleibt das Portal-Ergebnis stehen, das Ticket ist für den Sweep markiert und der Fehler steht im Sync-Protokoll.
 */
export async function schreibeZurueck(admin: SupabaseClient, ticketId: string): Promise<RueckErgebnis> {
  const markiere = (offen: boolean) => admin.rpc("mark_ticket_writeback", { p_ticket_id: ticketId, p_pending: offen });
  if (!rueckschreibenAn(process.env.VIVENU_WRITE_ENABLED) || !hasVivenuKey()) {
    await markiere(true);
    return "aus";
  }
  const { data } = await admin.rpc("ticket_writeback_data", { p_ticket_id: ticketId });
  const d = ((data ?? []) as {
    vivenu_ticket_id: string; secret: string; vivenu_event_id: string | null;
    first_name: string | null; last_name: string | null; company: string | null; job_position: string | null;
  }[])[0];
  if (!d) {
    await admin.rpc("record_sync_error", {
      p_job_id: null, p_object_type: "ticket_writeback", p_object_id: ticketId,
      p_message: "Kein vivenu-Ticket oder Secret gespeichert — Rückschreiben nicht möglich.", p_payload: {},
    });
    await markiere(true);
    return "ohne_secret";
  }
  try {
    let felder: DataField[] = [];
    if (d.vivenu_event_id) {
      const ev = await getEvent(d.vivenu_event_id);
      const sellerId = typeof ev.sellerId === "string" ? ev.sellerId : null;
      if (sellerId) {
        const q = new URLSearchParams({ sellerId, scope: "TICKET", eventId: d.vivenu_event_id });
        const typ = (await admin.from("ticket").select("vivenu_ticket_type_id").eq("id", ticketId).maybeSingle()).data?.vivenu_ticket_type_id;
        if (typ) q.set("ticketTypeId", String(typ));
        const res = await vv<DataField[] | { docs?: DataField[] }>(`/data-fields/resolve?${q}`);
        felder = Array.isArray(res) ? res : (res.docs ?? []);
      }
    }
    const { body, fehlend } = personalisierungsRumpf(
      { first_name: d.first_name ?? "", last_name: d.last_name ?? "", company: d.company ?? "", job_position: d.job_position ?? "" },
      felder,
    );
    if (fehlend.length > 0) console.info(`[bestaetigung] ohne vivenu-Feld (nur im Portal): ${fehlend.join(", ")}`);
    await vv(`/tickets/personalize/${encodeURIComponent(d.vivenu_ticket_id)}/${encodeURIComponent(d.secret)}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    await markiere(false);
    return "ok";
  } catch (e) {
    const text = ohneSecret(e instanceof Error ? e.message : String(e), d.secret).slice(0, 400);
    await admin.rpc("record_sync_error", {
      p_job_id: null, p_object_type: "ticket_writeback", p_object_id: ticketId, p_message: text, p_payload: {},
    });
    await markiere(true);
    return "fehler";
  }
}

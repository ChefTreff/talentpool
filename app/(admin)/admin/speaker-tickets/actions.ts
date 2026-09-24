"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSection } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { toRpcFailure } from "@/lib/rpc-error";
import { hasVivenuKey } from "@/lib/vivenu/client";
import { createFreeTicket, ticketSecretNachladen } from "@/lib/vivenu/free-tickets";

export type IssueResult =
  | { ok: true; vivenuTicketId: string; bereitsVorhanden: boolean }
  | { ok: false; key: string; detail?: string };

type IssueRow = {
  ticket_id: string;
  source: string;
  status: string;
  pass_type: string | null;
  lounge_access: boolean;
  holder_first_name: string | null;
  holder_last_name: string | null;
  holder_email: string | null;
  vivenu_event_id: string | null;
  vivenu_ticket_type_id: string | null;
  ticket_type_map_id: string | null;
  vivenu_ticket_id: string | null;
  speaker_name: string | null;
};

/**
 * Ein Freiticket bei vivenu anlegen und bei uns eintragen (SPK-068).
 *
 * Reihenfolge und warum sie so ist:
 *
 * 1. **Gate und Lesen** über die Nutzer-Sitzung. `speaker_ticket_for_issue`
 *    prüft dieselben Statusregeln wie `set_ticket_issued` gleich danach — wer
 *    hier „nicht dran" liest, löst gar keinen vivenu-Aufruf aus. Ein Ticket, das
 *    bei vivenu existiert und bei uns nicht, ist der teuerste Fehlerzustand.
 * 2. **vivenu anlegen**, idempotent über `batchId` = unsere Ticket-Kennung.
 * 3. **Zurückschreiben** über den Service-Client: `set_ticket_issued` und
 *    `set_ticket_secret` gehören dem Server (`auth.uid() is null`), damit das
 *    Secret nie über eine Nutzer-Sitzung läuft.
 *
 * Der Webhook `ticket.created` kann schneller sein als Schritt 3. Dann hat der
 * Ingest die Zeile über `batch` schon gefüllt, und `set_ticket_issued` erkennt
 * dieselbe Kennung und tut nichts — kein Fehler, kein zweites Ticket.
 */
export async function issueSpeakerTicket(ticketId: string): Promise<IssueResult> {
  await requireAdminSection("speakerTickets", "/admin/speaker-tickets");

  if (!hasVivenuKey()) return { ok: false, key: "config_missing", detail: "VIVENU_API_KEY" };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("speaker_ticket_for_issue", { p_ticket_id: ticketId });
  if (error) {
    const f = toRpcFailure(error);
    return { ok: false, key: f.key, detail: f.detail };
  }
  const zeile = ((data ?? []) as IssueRow[])[0];
  if (!zeile) return { ok: false, key: "ticket_not_found" };

  // Die Statusregeln stehen in `set_ticket_issued`; hier dieselbe Frage, nur
  // früher — damit kein vivenu-Ticket entsteht, das wir nicht eintragen dürfen.
  const dran =
    (zeile.source === "speaker" && zeile.status === "requested") ||
    (zeile.source === "speaker_companion" && zeile.status === "approved") ||
    // Schon ausgestellt: der Lauf darf trotzdem durch (Secret nachtragen), aber
    // er legt nichts Neues an — das erledigt die Idempotenz unten.
    Boolean(zeile.vivenu_ticket_id);
  if (!dran) {
    return { ok: false, key: zeile.source === "speaker" ? "not_pending" : "not_approved", detail: zeile.status };
  }
  if (!zeile.vivenu_event_id) return { ok: false, key: "edition_without_vivenu" };
  if (!zeile.vivenu_ticket_type_id) return { ok: false, key: "ticket_type_missing", detail: zeile.pass_type ?? "speaker" };
  const email = zeile.holder_email?.trim();
  const vorname = zeile.holder_first_name?.trim();
  const nachname = zeile.holder_last_name?.trim();
  // vivenu verlangt alle drei; ohne sie käme ein 400 zurück, das niemand deuten kann.
  if (!email || !vorname || !nachname) return { ok: false, key: "holder_incomplete" };

  let vivenuTicketId: string;
  let bereitsVorhanden: boolean;
  let barcode: string | null;
  let transaktion: string | null;
  let secret: string | null;
  try {
    const { ticket, bereitsVorhanden: schonDa } = await createFreeTicket({
      ticketId,
      vivenuEventId: zeile.vivenu_event_id,
      vivenuTicketTypeId: zeile.vivenu_ticket_type_id,
      firstName: vorname,
      lastName: nachname,
      email,
    });
    vivenuTicketId = String(ticket._id);
    bereitsVorhanden = schonDa;
    barcode = typeof ticket.barcode === "string" ? ticket.barcode : null;
    transaktion = typeof ticket.transactionId === "string" ? ticket.transactionId : null;
    secret = typeof ticket.secret === "string" && ticket.secret.trim() !== "" ? ticket.secret.trim() : null;
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : String(fehler);
    console.error("[speaker-tickets] vivenu:", text);
    return { ok: false, key: "vivenu_failed", detail: text.slice(0, 200) };
  }

  if (!barcode) {
    // Ohne Barcode kein QR und kein Einlass. `set_ticket_issued` weist das
    // ohnehin ab (22023) — hier mit einem Schlüssel, der etwas sagt.
    return { ok: false, key: "barcode_missing", detail: vivenuTicketId };
  }

  const admin = createSupabaseAdminClient();
  const { error: schreibFehler } = await admin.rpc("set_ticket_issued", {
    p_ticket_id: ticketId,
    p_vivenu_ticket_id: vivenuTicketId,
    p_barcode: barcode,
    p_vivenu_transaction_id: transaktion,
    p_ticket_type_map_id: zeile.ticket_type_map_id,
  });
  if (schreibFehler) {
    const f = toRpcFailure(schreibFehler);
    console.error("[speaker-tickets] set_ticket_issued:", schreibFehler.message);
    return { ok: false, key: f.key, detail: f.detail };
  }

  // Das Secret trägt den Wallet-Knopf im Speaker-Portal. Fehlt es in der
  // Antwort, holen wir es über die Transaktion nach; scheitert auch das, ist das
  // Ticket trotzdem gültig — nur der Wallet-Knopf bleibt ohne Ziel.
  if (!secret && transaktion) {
    try {
      secret = await ticketSecretNachladen(transaktion, vivenuTicketId);
    } catch (fehler) {
      console.error("[speaker-tickets] Secret nicht nachgeladen:", fehler instanceof Error ? fehler.message : fehler);
    }
  }
  if (secret) {
    const { error: secretFehler } = await admin.rpc("set_ticket_secret", {
      p_ticket_id: ticketId,
      p_secret: secret,
    });
    if (secretFehler) console.error("[speaker-tickets] set_ticket_secret:", secretFehler.message);
  }

  revalidatePath("/admin/speaker-tickets");
  return { ok: true, vivenuTicketId, bereitsVorhanden };
}

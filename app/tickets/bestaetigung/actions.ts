"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { loginUrl } from "@/lib/areas";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";
import { gueltigeTransaktion, pruefeEingabe } from "@/lib/vivenu/bestaetigung";
import { schreibeZurueck, type RueckErgebnis } from "@/lib/vivenu/transaktion";

export type PersonalisierenErgebnis =
  | { ok: true; rueck: RueckErgebnis }
  | { ok: false; key: string };

const MAX = 120;
const kurz = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, MAX) : "");

/**
 * Ein Ticket personalisieren (TAL-019). Die Datenbank prüft, ob die Person Käufer, Inhaber oder Besitzer ist
 * (`personalize_ticket`); **erst danach** greift der Service-Client zu und schreibt nach vivenu zurück. Das Ergebnis des
 * Rückschreibens ändert nichts am gespeicherten Stand: bei einem Fehler bleibt das Portal-Ergebnis stehen und das Ticket
 * ist für den Sweep markiert.
 */
export async function personalisiereTicket(eingabe: {
  ticketId: string;
  fuerMich: boolean;
  first_name: string;
  last_name: string;
  company: string;
  job_position: string;
  holder_email: string;
}): Promise<PersonalisierenErgebnis> {
  await requireUser();
  const e = {
    fuerMich: eingabe.fuerMich === true,
    first_name: kurz(eingabe.first_name),
    last_name: kurz(eingabe.last_name),
    company: kurz(eingabe.company),
    job_position: kurz(eingabe.job_position),
    holder_email: kurz(eingabe.holder_email),
  };
  const fehler = pruefeEingabe(e);
  if (fehler) return { ok: false, key: fehler };
  if (typeof eingabe.ticketId !== "string" || !/^[0-9a-f-]{36}$/.test(eingabe.ticketId)) return { ok: false, key: "ticket_not_found" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("personalize_ticket", {
    p_ticket_id: eingabe.ticketId,
    p_first_name: e.first_name,
    p_last_name: e.last_name,
    p_company: e.company,
    p_position: e.job_position,
    p_for_me: e.fuerMich,
    p_holder_email: e.fuerMich ? null : e.holder_email,
  });
  if (error) {
    const f = toRpcFailure(error as never);
    if (f.key === "unknown" && f.raw) console.error("[bestaetigung] personalize_ticket:", f.raw);
    return { ok: false, key: f.key };
  }
  const rueck = await schreibeZurueck(createSupabaseAdminClient(), eingabe.ticketId);
  revalidatePath("/tickets/bestaetigung");
  revalidatePath("/tickets");
  return { ok: true, rueck };
}

/**
 * Mit einer anderen E-Mail-Adresse anmelden (TAL-020, B6): wer mit der Firmenadresse angemeldet ist und mit der privaten gekauft hat, sah „Noch keine Tickets zu
 * sehen“ und hatte keinen Weg. Die Aktion meldet die Sitzung ab und führt zur Anmeldung zurück **zu derselben Bestellung** (`?next=`) — die Transaktions-Id geht
 * dabei nicht verloren. Sie liest und schreibt nichts außer der Sitzung; die Kennung wird geprüft (`gueltigeTransaktion`), der Rücksprung läuft über `loginUrl`
 * (`safeNextPath`).
 */
export async function anderesKonto(transaktion: string) {
  const tx = gueltigeTransaktion(transaktion);
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect(loginUrl(tx ? `/tickets/bestaetigung?transactionId=${encodeURIComponent(tx)}` : null));
}

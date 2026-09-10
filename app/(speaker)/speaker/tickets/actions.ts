"use server";

import { revalidatePath } from "next/cache";
import { requireArea } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";

/**
 * Begleitticket. Das eigene Ticket entsteht in der Datenbank, sobald das Team
 * den Speaker bestätigt — hier wird nichts angelegt, nur angefragt und
 * zurückgezogen.
 */
const PATH = "/speaker/tickets";

export type TicketResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; key: string; detail?: string };

function fail(error: unknown): { ok: false; key: string; detail?: string } {
  const f = toRpcFailure(error as never);
  if (f.key === "unknown" && f.raw) console.error("[speaker/tickets] RPC:", f.raw);
  return { ok: false, key: f.key, detail: f.detail };
}

async function client() {
  await requireArea("speaker", PATH);
  return createSupabaseServerClient();
}

function refresh() {
  revalidatePath(PATH);
  revalidatePath("/speaker");
}

export async function requestCompanion(
  profileId: string,
  email: string,
  firstName: string,
  lastName: string,
): Promise<TicketResult<{ id: string }>> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("request_companion_ticket", {
    p_profile_id: profileId,
    p_email: email,
    p_first_name: firstName,
    p_last_name: lastName,
  });
  if (error) return fail(error);
  refresh();
  return { ok: true, data: { id: (data as string) ?? "" } };
}

/** Zurückziehen geht nur, solange nichts ausgestellt ist (P0001 already_issued). */
export async function cancelCompanion(ticketId: string): Promise<TicketResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("cancel_companion_ticket", {
    p_ticket_id: ticketId,
  });
  if (error) return fail(error);
  refresh();
  return { ok: true, data: undefined };
}

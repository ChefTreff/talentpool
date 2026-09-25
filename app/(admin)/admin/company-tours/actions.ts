"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSection } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";

export type Ergebnis = { ok: true } | { ok: false; key: string; detail?: string };

export type Stopp = {
  stop_id: string;
  sort_order: number;
  arrival_at: string | null;
  departure_at: string | null;
  host_org_id: string | null;
  host_org_name: string | null;
  address: string | null;
  contact_name: string | null;
  time_note: string | null;
  snacks: boolean | null;
  notes_public: string | null;
  filled_at: string | null;
};

/**
 * Gate hier **und** in der RPC (`has_admin_section('companyTours')`): die Tür
 * zum Admin lässt jede Teamrolle ein, der Abschnitt entscheidet selbst. Eine
 * Server-Action ist ein eigener Einstieg von aussen, keine Fortsetzung der Seite.
 */
async function ruf(name: string, args: Record<string, unknown>): Promise<Ergebnis> {
  await requireAdminSection("companyTours");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc(name, args);
  if (error) {
    const f = toRpcFailure(error);
    return { ok: false, key: f.key, detail: f.detail };
  }
  revalidatePath("/admin/company-tours");
  return { ok: true };
}

export async function saveTour(data: Record<string, unknown>) {
  return ruf("upsert_company_tour", { p_data: data });
}

export async function saveStop(data: Record<string, unknown>) {
  return ruf("upsert_company_tour_stop", { p_data: data });
}

/** Die Stopps einer Tour — erst beim Öffnen geladen, nicht mit der Liste. */
export async function ladeStopps(
  tourId: string,
): Promise<{ ok: true; stopps: Stopp[] } | { ok: false; key: string; detail?: string }> {
  await requireAdminSection("companyTours");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("company_tour_stops_admin", { p_tour_id: tourId });
  if (error) {
    const f = toRpcFailure(error);
    return { ok: false, key: f.key, detail: f.detail };
  }
  return { ok: true, stopps: (data ?? []) as Stopp[] };
}

/**
 * Eine Begleitung anlegen oder ändern (ADM-059).
 *
 * Schreibt über `upsert_edition_contact` — dieselbe Funktion, die auch der
 * Ansprechpartner-Bereich nutzt, mit denselben Regeln für Pflichtfelder und
 * Einwilligung. Sie prüft selbst, dass wer nur diesen Abschnitt hat,
 * ausschliesslich Begleitungen (`tour_lead`) pflegt. Zurück kommt die Kennung,
 * damit der Tour-Editor sie sofort setzen kann.
 */
export async function saveTourLead(
  data: Record<string, unknown>,
): Promise<{ ok: true; id: string } | { ok: false; key: string; detail?: string }> {
  await requireAdminSection("companyTours");
  const supabase = await createSupabaseServerClient();
  const { data: id, error } = await supabase.rpc("upsert_edition_contact", {
    p_data: { ...data, type: "tour_lead" },
  });
  if (error) {
    const f = toRpcFailure(error);
    return { ok: false, key: f.key, detail: f.detail };
  }
  revalidatePath("/admin/company-tours");
  return { ok: true, id: id as string };
}

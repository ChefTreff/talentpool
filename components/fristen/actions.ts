"use server";

import { revalidatePath } from "next/cache";
import { requireAnyAdminSection } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";

/**
 * Schreibwege der Fristen (ADM-099). Das Gate ist die Tür (irgendein Fristen-Abschnitt), die **Grenze** ist die
 * Datenbank: `upsert_deadline` und `delete_deadline` prüfen `can_edit_deadline(Zielgruppe)` — ein Partner-Team ändert
 * Partner-Fristen, nicht die der Speaker. Der Baustein steht in `/admin/fristen` und in den Bereichsseiten; alle
 * Pfade werden neu geladen.
 */
const PFADE = ["/admin/fristen", "/admin/partner", "/admin/speaker", "/admin/volunteers"] as const;
const ABSCHNITTE = ["deadlines", "deadlinesSpeaker", "deadlinesPartner", "deadlinesVolunteers", "deadlinesSystem"] as const;

export type FristErgebnis = { ok: true } | { ok: false; key: string; detail?: string };

async function client() {
  await requireAnyAdminSection(ABSCHNITTE, PFADE[0]);
  return createSupabaseServerClient();
}

function neuLaden() {
  for (const p of PFADE) revalidatePath(p);
}

export type FristEingabe = {
  edition_id: string;
  audience: string;
  /** Nur beim Ändern: die Id der Frist (aus der Zeile). Der Schlüssel kommt nie aus der Oberfläche. */
  id?: string;
  due_at: string;
  label_de: string;
  label_en: string;
  description_de: string;
  description_en: string;
  reminder_days: number;
};

/**
 * Anlegen oder ändern. Ohne `id` entsteht eine **eigene Frist** (die Datenbank erzeugt den Schlüssel `custom_<slug>`); mit `id`
 * wird die Frist geändert — Edition und Zielgruppe einer Systemfrist bleiben dabei fest.
 */
export async function speichereFrist(eingabe: FristEingabe): Promise<FristErgebnis> {
  const supabase = await client();
  const { error } = await supabase.rpc("upsert_deadline", { p_data: eingabe });
  if (error) {
    const f = toRpcFailure(error);
    if (f.key === "unknown") console.error("[fristen] upsert_deadline:", f.raw);
    return { ok: false, key: f.key, detail: f.detail };
  }
  neuLaden();
  return { ok: true };
}

/** Löschen: nur eigene, ungenutzte Fristen (`deadline_in_use` mit der Zahl der Verweise, `deadline_is_system`). */
export async function loescheFrist(id: string): Promise<FristErgebnis> {
  const supabase = await client();
  const { error } = await supabase.rpc("delete_deadline", { p_id: id });
  if (error) {
    const f = toRpcFailure(error);
    if (f.key === "unknown") console.error("[fristen] delete_deadline:", f.raw);
    return { ok: false, key: f.key, detail: f.detail };
  }
  neuLaden();
  return { ok: true };
}

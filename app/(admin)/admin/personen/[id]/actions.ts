"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSection } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";

export type SalutationResult = { ok: true } | { ok: false; key: string; detail?: string };

/**
 * Briefanrede pflegen. Geschrieben wird über die **Sitzung**, nicht über den
 * Admin-Client, mit dem diese Seite liest: so prüft `set_person_salutation`
 * die Rolle in der Datenbank und das Protokoll trägt die handelnde Person.
 */
export async function saveSalutation(
  personId: string,
  de: string,
  en: string,
): Promise<SalutationResult> {
  await requireAdminSection("persons", `/admin/personen/${personId}`);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_person_salutation", {
    p_person_id: personId,
    p_de: de,
    p_en: en,
  });
  if (error) {
    const f = toRpcFailure(error);
    if (f.key === "unknown") console.error("[admin/personen] set_person_salutation:", f.raw);
    return { ok: false, key: f.key, detail: f.detail };
  }
  revalidatePath(`/admin/personen/${personId}`);
  return { ok: true };
}

export type DeletionOpenResult = { ok: true } | { ok: false; key: string; detail?: string };

/**
 * Löschung für eine Person anlegen (ADM-031) — etwa wenn die Bitte per Mail
 * kam oder die Person gar kein Konto hat. **Gelöscht wird hier nicht:** der
 * Antrag landet in der Warteschlange und wird dort bestätigt, auf demselben
 * Weg wie jeder andere. Über die Sitzung, damit `open_deletion_request` die
 * Admin-Rolle prüft und das Protokoll die handelnde Person trägt.
 */
export async function openDeletion(personId: string, note: string): Promise<DeletionOpenResult> {
  await requireAdminSection("persons", `/admin/personen/${personId}`);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("open_deletion_request", {
    p_person_id: personId,
    p_note: note.trim() || null,
  });
  if (error) {
    const f = toRpcFailure(error);
    if (f.key === "unknown") console.error("[admin/personen] open_deletion_request:", f.raw);
    return { ok: false, key: f.key, detail: f.detail };
  }
  revalidatePath(`/admin/personen/${personId}`);
  revalidatePath("/admin/loeschantraege");
  return { ok: true };
}

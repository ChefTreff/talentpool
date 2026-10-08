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

export type MasterDataResult = { ok: true; changed: string[] } | { ok: false; key: string; detail?: string };

/** Die Felder, die `update_person_master` kennt — mehr nimmt die Funktion nicht an. */
export type MasterDataPatch = Partial<
  Record<
    | "first_name" | "last_name" | "title" | "birthdate" | "gender" | "nationality" | "country" | "city"
    | "phone" | "linkedin_url" | "preferred_language",
    string
  >
>;

/**
 * Stammdaten einer Person ändern (ADM-092) — für Änderungsanfragen. Über die
 * **Sitzung**, damit `update_person_master` den Abschnitt `persons` prüft und
 * das Protokoll die handelnde Person trägt. Die Funktion meldet zurück, was sich
 * tatsächlich geändert hat; ohne Änderung entsteht kein Protokolleintrag.
 */
export async function saveMasterData(personId: string, patch: MasterDataPatch): Promise<MasterDataResult> {
  await requireAdminSection("persons", `/admin/personen/${personId}`);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("update_person_master", { p_person_id: personId, p_patch: patch });
  if (error) {
    const f = toRpcFailure(error);
    if (f.key === "unknown") console.error("[admin/personen] update_person_master:", f.raw);
    return { ok: false, key: f.key, detail: f.detail };
  }
  revalidatePath(`/admin/personen/${personId}`);
  revalidatePath("/admin/personen");
  return { ok: true, changed: (data ?? []) as string[] };
}

export type EmailAction = "add" | "primary" | "remove" | "change";
export type EmailResult = { ok: true } | { ok: false; key: string; detail?: string };

/**
 * E-Mail-Adressen einer Person pflegen (ADM-092): hinzufügen, primär setzen,
 * entfernen, berichtigen. Berichtigen geht nur ohne Login (die Funktion lehnt
 * sonst mit `login_email_locked` ab). Ins Protokoll kommt nie die Adresse.
 */
export async function manageEmail(
  personId: string,
  action: EmailAction,
  emailId: string | null,
  email: string | null,
): Promise<EmailResult> {
  await requireAdminSection("persons", `/admin/personen/${personId}`);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("manage_person_email", {
    p_person_id: personId,
    p_action: action,
    p_email_id: emailId,
    p_email: email,
  });
  if (error) {
    const f = toRpcFailure(error);
    if (f.key === "unknown") console.error("[admin/personen] manage_person_email:", f.raw);
    return { ok: false, key: f.key, detail: f.detail };
  }
  revalidatePath(`/admin/personen/${personId}`);
  revalidatePath("/admin/personen");
  return { ok: true };
}

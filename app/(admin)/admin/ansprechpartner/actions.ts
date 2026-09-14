"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { toRpcFailure } from "@/lib/rpc-error";

const PFAD = "/admin/ansprechpartner";
const BUCKET = "contact-photos";

export type Ergebnis = { ok: true; id?: string } | { ok: false; key: string };

async function ruf(name: string, args: Record<string, unknown>): Promise<Ergebnis> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(name, args);
  if (error) return { ok: false, key: toRpcFailure(error).key };
  revalidatePath(PFAD);
  return { ok: true, id: typeof data === "string" ? data : undefined };
}

export async function saveContact(data: Record<string, unknown>): Promise<Ergebnis> {
  return ruf("upsert_edition_contact", { p_data: data });
}
export async function removeContact(id: string): Promise<Ergebnis> {
  return ruf("delete_edition_contact", { p_id: id });
}
export async function saveInfo(data: Record<string, unknown>): Promise<Ergebnis> {
  return ruf("upsert_edition_info", { p_data: data });
}
export async function removeInfo(id: string): Promise<Ergebnis> {
  return ruf("delete_edition_info", { p_id: id });
}

/**
 * Bild hochladen.
 *
 * Der Bucket `contact-photos` ist öffentlich lesbar, aber **nur service_role
 * darf schreiben** — niemand lädt aus dem Browser direkt hinein. Deshalb geht
 * der Weg über diese Aktion: erst die Rolle prüfen (dieselbe Regel wie beim
 * Pflegen, geprüft von der Datenbank und nicht hier), dann mit dem
 * Admin-Client ablegen.
 */
export async function uploadPhoto(form: FormData): Promise<Ergebnis & { path?: string }> {
  const datei = form.get("file");
  const kontakt = String(form.get("contactId") ?? "");
  if (!(datei instanceof File) || datei.size === 0) return { ok: false, key: "invalid_argument" };
  if (datei.size > 5 * 1024 * 1024) return { ok: false, key: "file_too_large" };

  // Rechteprüfung über die Datenbank, nicht über eine Annahme im Code.
  const supabase = await createSupabaseServerClient();
  const { data: darf, error } = await supabase.rpc("can_edit_edition_contacts");
  if (error || darf !== true) return { ok: false, key: "not_allowed" };

  const endung = datei.type === "image/png" ? "png" : datei.type === "image/webp" ? "webp" : "jpg";
  const pfad = `${kontakt || crypto.randomUUID()}.${endung}`;
  const admin = createSupabaseAdminClient();
  const { error: up } = await admin.storage
    .from(BUCKET)
    .upload(pfad, datei, { contentType: datei.type, upsert: true });
  if (up) return { ok: false, key: "upload_failed" };
  revalidatePath(PFAD);
  return { ok: true, path: pfad };
}

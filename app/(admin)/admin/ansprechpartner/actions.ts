"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSection } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { toRpcFailure } from "@/lib/rpc-error";

const PFAD = "/admin/ansprechpartner";
const BUCKET = "contact-photos";

export type Ergebnis = { ok: true; id?: string } | { ok: false; key: string };

async function ruf(name: string, args: Record<string, unknown>): Promise<Ergebnis> {
  // Siehe Videos: der Schutz hing an der Tür, und die steht seit PORT1 dem
  // ganzen Team offen. Die RPCs prüfen weiterhin selbst — das hier ist die
  // zweite Schranke, nicht die einzige.
  await requireAdminSection("contacts");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(name, args);
  if (error) return { ok: false, key: toRpcFailure(error).key };
  revalidatePath(PFAD);
  return { ok: true, id: typeof data === "string" ? data : undefined };
}

export async function saveContact(data: Record<string, unknown>): Promise<Ergebnis> {
  return ruf("upsert_edition_contact", { p_data: data });
}
/**
 * Ansprechperson entfernen.
 *
 * `consent_withdrawn` ist kein Schmuck: die RPC schreibt damit einen eigenen
 * Protokolleintrag, und das Foto wird mitgenommen — sonst bliebe das Gesicht
 * einer Person im Bucket, die gerade ihre Einwilligung zurückgezogen hat.
 */
export async function removeContact(id: string, reason?: "consent_withdrawn"): Promise<Ergebnis> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("delete_edition_contact", {
    p_id: id,
    p_reason: reason ?? null,
  });
  if (error) return { ok: false, key: toRpcFailure(error).key };
  if (typeof data === "string" && data !== "") {
    const admin = createSupabaseAdminClient();
    const { error: wegFehler } = await admin.storage.from(BUCKET).remove([data]);
    if (wegFehler) console.error("[ansprechpartner] Foto nicht entfernt:", wegFehler.message);
  }
  revalidatePath(PFAD);
  return { ok: true };
}
export async function saveInfo(data: Record<string, unknown>): Promise<Ergebnis> {
  return ruf("upsert_edition_info", { p_data: data });
}
export async function removeInfo(id: string): Promise<Ergebnis> {
  return ruf("delete_edition_info", { p_id: id });
}

/**
 * Einen Platz im Bucket freigeben, damit der Browser das Bild **direkt** dorthin
 * lädt.
 *
 * Vorher ging die Datei durch eine Server Action — und die hat bei Next.js ein
 * Limit von 1 MB. Ein normales Porträt aus einer Kamera ist grösser, der Upload
 * brach mit 413 ab, und im Formular erschien nur „Das hat nicht geklappt"
 * (Konrad, 18.09.). Die Oberfläche versprach 5 MB, die Plattform hielt 1 MB —
 * ein Versprechen, das nicht uns gehörte.
 *
 * Jetzt prüft der Server nur noch das Recht und den Dateityp und gibt einen
 * signierten Pfad zurück; die Bytes nimmt Supabase entgegen. **Den Pfad
 * bestimmt der Server**, nicht der Browser — sonst könnte jemand aus dem
 * Bucket-Ordner hinausschreiben. Die Grösse (5 MB) und die erlaubten Typen
 * stehen am Bucket selbst und gelten auch dann, wenn jemand die Oberfläche
 * umgeht.
 */
export async function createPhotoUploadUrl(
  contactId: string,
  contentType: string,
): Promise<{ ok: true; path: string; token: string } | { ok: false; key: string }> {
  // Diese Action geht am Helfer `ruf` vorbei (sie ruft keine RPC, sondern den
  // Storage) und braucht das Gate deshalb selbst. Die Datenbankprüfung
  // `can_edit_edition_contacts()` weiter unten bleibt — sie ist die, die zählt.
  await requireAdminSection("contacts");
  // Nur die drei Bildtypen des Buckets — alles andere wird hier abgewiesen und
  // nicht als „jpg“ umetikettiert (Review 14.09.).
  const ENDUNG: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
  const endung = ENDUNG[contentType];
  if (!endung) return { ok: false, key: "invalid_argument" };

  // Rechteprüfung über die Datenbank, nicht über eine Annahme im Code.
  const supabase = await createSupabaseServerClient();
  const { data: darf, error } = await supabase.rpc("can_edit_edition_contacts");
  if (error || darf !== true) return { ok: false, key: "not_allowed" };

  // Die Kontakt-Id kommt aus dem Formular: nur eine echte UUID wird Dateiname,
  // sonst könnte der Pfad aus dem Bucket-Ordner hinausführen.
  const istUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(contactId);
  const pfad = `${istUuid ? contactId : crypto.randomUUID()}.${endung}`;

  const admin = createSupabaseAdminClient();
  const { data, error: sigFehler } = await admin.storage
    .from(BUCKET)
    .createSignedUploadUrl(pfad, { upsert: true });
  if (sigFehler || !data) {
    console.error("[ansprechpartner] Upload-Adresse nicht erstellt:", sigFehler?.message);
    return { ok: false, key: "upload_failed" };
  }
  revalidatePath(PFAD);
  return { ok: true, path: pfad, token: data.token };
}

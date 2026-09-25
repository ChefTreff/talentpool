"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSection } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { toRpcFailure } from "@/lib/rpc-error";

export type Ergebnis = { ok: true } | { ok: false; key: string; detail?: string };

const PFAD = "/admin/verwaltung/zugaenge";
/** Reversibel und lang: „gesperrt" heisst nicht „für hundert Jahre weg", sondern „bis jemand es zurücknimmt". */
const BANN = "876000h";

/**
 * Zugang sperren oder wieder öffnen (PORT4b).
 *
 * Zwei Schritte, in dieser Reihenfolge:
 *
 * 1. **Die Datenbank** (`set_person_access`) — sie prüft das Abschnittsrecht,
 *    verweigert die Selbstsperre und schreibt das Audit. Scheitert sie, endet
 *    es hier; ein gebanntes Konto ohne Eintrag wäre der schlechtere Zustand.
 * 2. **Das Auth-Konto** bannen oder entbannen (K-42, Empfehlung angewendet).
 *    Reversibel: `ban_duration: "none"` hebt es auf. Ohne diesen Schritt bliebe
 *    die Anmeldung möglich — die Person käme herein und sähe nichts, statt
 *    draussen zu bleiben.
 *
 * Schlägt Schritt 2 fehl, sagt die Antwort das: die Rechte sind weg, die Tür
 * ist es nicht. Das ist etwas anderes als „hat geklappt".
 */
export async function setzeZugang(personId: string, sperren: boolean, notiz: string): Promise<Ergebnis> {
  await requireAdminSection("access", PFAD);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_person_access", {
    p_person_id: personId,
    p_blocked: sperren,
    p_note: notiz,
  });
  if (error) {
    const f = toRpcFailure(error);
    return { ok: false, key: f.key, detail: f.detail };
  }

  const admin = createSupabaseAdminClient();
  const { data: person } = await admin.from("person").select("auth_user_id").eq("id", personId).single();
  const uid = person?.auth_user_id as string | null | undefined;
  if (uid) {
    const { error: bannFehler } = await admin.auth.admin.updateUserById(uid, {
      ban_duration: sperren ? BANN : "none",
    });
    if (bannFehler) {
      console.error("[zugaenge] Bann nicht gesetzt:", bannFehler.message);
      revalidatePath(PFAD);
      return { ok: false, key: "auth_ban_failed", detail: bannFehler.message.slice(0, 200) };
    }
  }
  revalidatePath(PFAD);
  return { ok: true };
}

/**
 * Eine Anmelde-Mail an die hinterlegte Adresse (PORT4b).
 *
 * Über den Admin-Client und **erst nach** der Rollenprüfung. Die Adresse kommt
 * aus unserer Datenbank, nicht aus dem Formular: eine Einladung an eine
 * eingetippte Adresse wäre ein Weg, jemand Fremdem ein Konto zu verschaffen.
 */
export async function ladeEin(personId: string): Promise<Ergebnis> {
  await requireAdminSection("access", PFAD);
  const admin = createSupabaseAdminClient();
  const { data: mail } = await admin
    .from("person_email").select("email").eq("person_id", personId).eq("is_primary", true).maybeSingle();
  const adresse = (mail?.email as string | undefined)?.trim();
  if (!adresse) return { ok: false, key: "email_missing" };

  const { error } = await admin.auth.admin.inviteUserByEmail(adresse);
  if (error) {
    console.error("[zugaenge] Einladung:", error.message);
    return { ok: false, key: "invite_failed", detail: error.message.slice(0, 200) };
  }
  // Über die Nutzer-Sitzung, damit im Protokoll steht, **wer** eingeladen hat.
  const supabase = await createSupabaseServerClient();
  await supabase.rpc("log_access_invite", { p_person_id: personId });
  revalidatePath(PFAD);
  return { ok: true };
}

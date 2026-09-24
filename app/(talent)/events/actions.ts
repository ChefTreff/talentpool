"use server";

import { revalidatePath } from "next/cache";
import { requireArea } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { lumaClient, hasLumaKey } from "@/lib/luma/client";
import { isOurEvent, lumaWriteEnabled } from "@/lib/luma/events";
import { toAddGuests } from "@/lib/luma/mapping";

export type AnmeldeErgebnis =
  | { ok: true; status: "registered" | "pending" }
  | { ok: false; key: "not_live" | "closed" | "no_email" | "failed" };

/**
 * Anmeldung zu einem Community-Event aus dem Portal (TAL-007, D12).
 *
 * Name und E-Mail kommen aus dem Profil — kein zweites Formular. Luma
 * verschickt Bestätigung und Erinnerung. Danach schreibt der Server die
 * Teilnahme sofort ins Profil (Dienstschlüssel, erst **nach** `requireArea`
 * und nur für die eigene Person); der Abgleich trägt später die Gast-Id nach.
 *
 * Schreibt erst nach Luma, wenn `LUMA_WRITE_ENABLED=true` gesetzt ist.
 */
export async function registerForEvent(lumaEventId: string): Promise<AnmeldeErgebnis> {
  const user = await requireArea("talent", "/events");
  if (!hasLumaKey() || !lumaWriteEnabled()) return { ok: false, key: "not_live" };

  const supabase = await createSupabaseServerClient();
  const { data: person } = await supabase.from("person").select("first_name,last_name").maybeSingle();
  const { data: mail } = await supabase
    .from("person_email")
    .select("email")
    .eq("is_primary", true)
    .maybeSingle();
  const email = (mail?.email as string | undefined) ?? user.user?.email ?? null;
  if (!email) return { ok: false, key: "no_email" };

  const luma = lumaClient();
  try {
    const ev = await luma.getEvent(lumaEventId);
    const vorbei = new Date(ev.end_at).getTime() <= Date.now();
    if (!isOurEvent(ev) || ev.visibility === "private" || ev.registration_open === false || vorbei) {
      return { ok: false, key: "closed" };
    }
    await luma.addGuests(
      toAddGuests(ev.id, { email, firstName: person?.first_name ?? null, lastName: person?.last_name ?? null }),
      { live: true },
    );

    const status = ev.require_approval ? "pending" : "registered";
    const admin = createSupabaseAdminClient();
    await admin.rpc("luma_sync_event", {
      p_data: {
        luma_id: ev.id,
        name: ev.name,
        start_at: ev.start_at,
        end_at: ev.end_at,
        timezone: ev.timezone,
        city: ev.geo_address_json?.city ?? ev.geo_address_json?.city_state ?? null,
        url: ev.url,
      },
    });
    await admin.rpc("luma_sync_registration", {
      p_luma_event_id: ev.id,
      p_email: email,
      p_guest_id: null,
      p_status: status,
    });
    revalidatePath("/events");
    return { ok: true, status };
  } catch (e) {
    console.error("[luma] Anmeldung:", e instanceof Error ? e.message : e);
    return { ok: false, key: "failed" };
  }
}

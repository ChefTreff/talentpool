"use server";

import { revalidatePath } from "next/cache";
import { requireArea } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { consentRowsToWrite, type ConsentState } from "@/lib/consent";

/**
 * Themen speichern (TAL-009). Themen **schränken die Newsletter-Einwilligung
 * ein** (K-43): ohne `newsletter` gibt es keine Themen; wer alle Themen
 * abwählt, widerruft den Newsletter — ehrlicher als „angemeldet, aber nichts
 * gewählt“. Wer Themen wählt, ohne zugestimmt zu haben, stimmt mit diesem
 * Klick zu (die Seite sagt das am Knopf). Jede Änderung der Einwilligung ist
 * eine eigene Zeile im Nachweis (`consentRowsToWrite`, wie im Profil).
 */
export async function saveTopics(
  topics: string[],
): Promise<{ ok: true } | { ok: false; key: "no_person" | "save_failed" }> {
  await requireArea("talent", "/benachrichtigungen");
  const supabase = await createSupabaseServerClient();
  const { data: pid } = await supabase.rpc("current_person_id");
  if (!pid) return { ok: false, key: "no_person" };

  const { data: aktiv } = await supabase.from("vocab_term").select("key")
    .eq("vocabulary", "notification_topic").eq("active", true);
  const erlaubt = new Set(((aktiv ?? []) as { key: string }[]).map((t) => t.key));
  const gewaehlt = [...new Set(topics)].filter((t) => erlaubt.has(t));

  const { error: delErr } = await supabase.from("person_interest").delete()
    .eq("person_id", pid).eq("vocabulary", "notification_topic");
  if (delErr) return { ok: false, key: "save_failed" };
  if (gewaehlt.length) {
    const { error } = await supabase.from("person_interest")
      .insert(gewaehlt.map((t) => ({ person_id: pid, vocabulary: "notification_topic", term_key: t })));
    if (error) return { ok: false, key: "save_failed" };
  }

  const { data: current } = await supabase.from("consent_current").select("consent_type, granted, version");
  const rows = consentRowsToWrite((current ?? []) as ConsentState[], { newsletter: gewaehlt.length > 0 }, pid as string);
  if (rows.length) {
    const { error } = await supabase.from("consent_record").insert(rows);
    if (error) return { ok: false, key: "save_failed" };
  }
  revalidatePath("/benachrichtigungen");
  revalidatePath("/profil");
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CONSENT_VERSION, type StepResult, type WizardData, type WizardStep } from "./types";

const nn = (v: string) => (v && v.trim() !== "" ? v.trim() : null);

/**
 * Einen Schritt speichern. Der Wizard schreibt nach jedem Schritt, damit ein
 * Abbruch nichts kostet — Progressive Profiling heißt auch: das Angefangene bleibt.
 * Läuft unter RLS mit dem Session-Client; nur die eigene Person ist schreibbar.
 */
export async function saveStep(
  step: WizardStep,
  data: WizardData,
): Promise<StepResult> {
  await requireUser("/onboarding");
  const supabase = await createSupabaseServerClient();

  const { data: pid } = await supabase.rpc("current_person_id");
  if (!pid) return { ok: false, message: "no_person" };

  if (step === "basics") {
    const { error } = await supabase
      .from("person")
      .update({
        first_name: nn(data.first_name),
        last_name: nn(data.last_name),
        preferred_language: data.preferred_language || "de",
        city: nn(data.city),
        country: nn(data.country),
      })
      .eq("id", pid);
    if (error) return { ok: false, message: "save_failed", detail: error.message };
  }

  if (step === "work") {
    const { error } = await supabase
      .from("person")
      .update({
        occupation_status: nn(data.occupation_status),
        career_level: nn(data.career_level),
        employer_name: nn(data.employer_name),
        study_field: nn(data.study_field),
        university: nn(data.university),
      })
      .eq("id", pid);
    if (error) return { ok: false, message: "save_failed", detail: error.message };
  }

  if (step === "interests") {
    const { error: del } = await supabase
      .from("person_interest")
      .delete()
      .eq("person_id", pid);
    if (del) return { ok: false, message: "save_failed", detail: del.message };

    const rows = [
      ...data.interests.map((k) => ({
        person_id: pid,
        vocabulary: "interests",
        term_key: k,
      })),
      ...data.interests_founder.map((k) => ({
        person_id: pid,
        vocabulary: "interests_founder",
        term_key: k,
      })),
    ];
    if (rows.length > 0) {
      const { error } = await supabase.from("person_interest").insert(rows);
      if (error) return { ok: false, message: "save_failed", detail: error.message };
    }
  }

  if (step === "consent") {
    // Jede Einwilligung ist eine eigene Zeile — auch der Widerruf. Die RLS-Policy
    // erlaubt nur `source = 'portal'` für die eigene Person.
    const rows = Object.entries(data.consents).map(([consent_type, granted]) => ({
      person_id: pid,
      consent_type,
      version: CONSENT_VERSION,
      granted,
      source: "portal",
    }));
    if (rows.length > 0) {
      const { error } = await supabase.from("consent_record").insert(rows);
      if (error) return { ok: false, message: "save_failed", detail: error.message };
    }
  }

  revalidatePath("/onboarding");
  revalidatePath("/profil");
  return { ok: true };
}

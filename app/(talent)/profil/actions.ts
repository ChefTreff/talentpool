"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";
import { consentRowsToWrite, type ConsentState } from "@/lib/consent";
import {
  cleanLanguages,
  EDITABLE_CONSENTS,
  parseGraduationYear,
  PROFILE_MULTI_VOCABS,
  type ExtendedProfile,
} from "./felder";

export type ProfileInput = {
  first_name: string;
  last_name: string;
  birthdate: string; // yyyy-mm-dd | ""
  gender: string;
  nationality: string;
  country: string;
  preferred_language: string;
  phone: string;
  linkedin_url: string;
  occupation_status: string;
  work_experience: string;
  career_level: string;
  employer_type: string;
  employer_name: string;
  startup_phase: string;
  study_field: string;
  study_program: string;
  university: string;
  self_assessment: string;
  city: string;
  interests: string[];
  interests_founder: string[];
  career_opportunities: string[];
  summit_goal: string[];
  skill: string[];
  work_mode: string[];
  channels: string[];
  /** `null`, solange die Migration `v6_profilfelder` nicht live ist. */
  extended: ExtendedProfile | null;
};

const nn = (v: string) => (v && v.trim() !== "" ? v.trim() : null);

export type SaveProfileResult =
  | { ok: true }
  /** Stabiler Schlüssel aus `messages` im Dictionary — den Text setzt die UI. */
  | {
      ok: false;
      message: "not_signed_in" | "no_person" | "save_failed" | "invalid_year";
      detail?: string;
    };

/**
 * Speichert das Profil der eingeloggten Person. Läuft mit dem Session-Client
 * (authenticated) -> RLS + Spalten-Grants greifen; nur Whitelist-Felder werden
 * geschrieben. Interessen/Kanäle (n:m) werden ersetzt.
 */
export async function saveProfile(input: ProfileInput): Promise<SaveProfileResult> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "not_signed_in" };

  const { data: pid } = await supabase.rpc("current_person_id");
  if (!pid) return { ok: false, message: "no_person" };

  const ext = input.extended;
  const year = ext ? parseGraduationYear(ext.graduation_year) : null;
  if (year === "invalid") return { ok: false, message: "invalid_year" };

  const { error: upErr } = await supabase
    .from("person")
    .update({
      city: nn(input.city),
      ...(ext && {
        job_title: nn(ext.job_title),
        study_program_label: nn(ext.study_program_label),
        job_openness: nn(ext.job_openness),
        function_area: nn(ext.function_area),
        graduation_year: year,
        availability: nn(ext.availability),
        mobility: nn(ext.mobility),
      }),
      first_name: nn(input.first_name),
      last_name: nn(input.last_name),
      birthdate: nn(input.birthdate),
      gender: nn(input.gender),
      nationality: nn(input.nationality),
      country: nn(input.country),
      // Leer heißt „keine Wahl" (Spalte ist seit 0029 nullable).
      preferred_language: input.preferred_language || null,
      phone: nn(input.phone),
      linkedin_url: nn(input.linkedin_url),
      occupation_status: nn(input.occupation_status),
      work_experience: nn(input.work_experience),
      career_level: nn(input.career_level),
      employer_type: nn(input.employer_type),
      employer_name: nn(input.employer_name),
      startup_phase: nn(input.startup_phase),
      study_field: nn(input.study_field),
      study_program: nn(input.study_program),
      university: nn(input.university),
      self_assessment: nn(input.self_assessment),
    })
    .eq("id", pid);
  if (upErr) return { ok: false, message: "save_failed", detail: upErr.message };

  // Mehrfachauswahl (n:m) ersetzen. Ohne die Migration kennt `person_interest`
  // nur die beiden alten Listen — dann auch nur diese anfassen.
  const vocabs = ext ? [...PROFILE_MULTI_VOCABS] : (["interests", "interests_founder"] as const);
  {
    const { error } = await supabase
      .from("person_interest")
      .delete()
      .eq("person_id", pid)
      .in("vocabulary", vocabs);
    if (error) return { ok: false, message: "save_failed", detail: error.message };
  }
  const interestRows = vocabs.flatMap((vocabulary) =>
    input[vocabulary].map((term_key) => ({ person_id: pid, vocabulary, term_key })),
  );
  if (interestRows.length) {
    const { error } = await supabase.from("person_interest").insert(interestRows);
    if (error) return { ok: false, message: "save_failed", detail: error.message };
  }

  // Akquise-Kanäle (n:m) ersetzen
  {
    const { error } = await supabase
      .from("person_acquisition_channel")
      .delete()
      .eq("person_id", pid);
    if (error) return { ok: false, message: "save_failed", detail: error.message };
  }
  if (input.channels.length) {
    const rows = input.channels.map((k) => ({
      person_id: pid,
      vocabulary: "acquisition_channel",
      term_key: k,
    }));
    const { error } = await supabase
      .from("person_acquisition_channel")
      .insert(rows);
    if (error) return { ok: false, message: "save_failed", detail: error.message };
  }

  // Sprachen mit Niveau (B4) ersetzen.
  if (ext) {
    const { error: delErr } = await supabase.from("person_language").delete().eq("person_id", pid);
    if (delErr) return { ok: false, message: "save_failed", detail: delErr.message };
    const rows = cleanLanguages(ext.languages).map((l) => ({ person_id: pid, ...l }));
    if (rows.length) {
      const { error } = await supabase.from("person_language").insert(rows);
      if (error) return { ok: false, message: "save_failed", detail: error.message };
    }
  }

  revalidatePath("/profil");
  return { ok: true };
}

/**
 * Einwilligungen im Profil ändern (TAL-013 A9, B2). Wie im Onboarding wird nur
 * geschrieben, was sich gegenüber `consent_current` geändert hat — jede
 * Änderung ist eine eigene Zeile im Nachweis. Pflicht-Einwilligungen stehen
 * nicht in der Liste: wer sie zurücknehmen will, löscht sein Profil.
 */
export async function saveConsents(
  wanted: Record<string, boolean>,
): Promise<{ ok: true } | { ok: false; message: "no_person" | "save_failed" }> {
  const supabase = await createSupabaseServerClient();
  const { data: pid } = await supabase.rpc("current_person_id");
  if (!pid) return { ok: false, message: "no_person" };

  const allowed = Object.fromEntries(
    EDITABLE_CONSENTS.filter((k) => typeof wanted[k] === "boolean").map((k) => [k, wanted[k]]),
  );
  const { data: current } = await supabase
    .from("consent_current")
    .select("consent_type, granted, version");
  const rows = consentRowsToWrite((current ?? []) as ConsentState[], allowed, pid as string);
  if (rows.length) {
    const { error } = await supabase.from("consent_record").insert(rows);
    if (error) return { ok: false, message: "save_failed" };
  }
  revalidatePath("/profil");
  return { ok: true };
}

/**
 * Lebenslauf setzen oder entfernen (TAL-013 B3) — gleicher Weg wie das
 * Porträt: Datei direkt in den privaten Bucket, dann `set_my_cv`.
 */
export async function setMyCv(
  path: string | null,
): Promise<{ ok: true } | { ok: false; key: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_my_cv", { p_path: path });
  if (error) return { ok: false, key: toRpcFailure(error).key };
  revalidatePath("/profil");
  return { ok: true };
}

/**
 * Porträt setzen oder entfernen (TAL-012). Die Datei liegt zu diesem Zeitpunkt
 * schon im Bucket — der Browser lädt sie direkt hoch, die Storage-Policy prüft
 * den Pfad. `set_my_photo` prüft ihn noch einmal, setzt `person.photo_path`
 * und meldet das bisherige Bild zum Wegräumen an.
 */
export async function setMyPortrait(
  path: string | null,
): Promise<{ ok: true } | { ok: false; key: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_my_photo", { p_path: path });
  if (error) return { ok: false, key: toRpcFailure(error).key };
  revalidatePath("/profil");
  return { ok: true };
}

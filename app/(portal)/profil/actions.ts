"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
  interests: string[];
  interests_founder: string[];
  channels: string[];
};

const nn = (v: string) => (v && v.trim() !== "" ? v.trim() : null);

/**
 * Speichert das Profil der eingeloggten Person. Läuft mit dem Session-Client
 * (authenticated) -> RLS + Spalten-Grants greifen; nur Whitelist-Felder werden
 * geschrieben. Interessen/Kanäle (n:m) werden ersetzt.
 */
export async function saveProfile(
  input: ProfileInput,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };

  const { data: pid } = await supabase.rpc("current_person_id");
  if (!pid) return { ok: false, error: "Keine Person gefunden." };

  const { error: upErr } = await supabase
    .from("person")
    .update({
      first_name: nn(input.first_name),
      last_name: nn(input.last_name),
      birthdate: nn(input.birthdate),
      gender: nn(input.gender),
      nationality: nn(input.nationality),
      country: nn(input.country),
      preferred_language: input.preferred_language || "de",
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
  if (upErr) return { ok: false, error: upErr.message };

  // Interessen (n:m) ersetzen
  {
    const { error } = await supabase
      .from("person_interest")
      .delete()
      .eq("person_id", pid);
    if (error) return { ok: false, error: error.message };
  }
  const interestRows = [
    ...input.interests.map((k) => ({
      person_id: pid,
      vocabulary: "interests",
      term_key: k,
    })),
    ...input.interests_founder.map((k) => ({
      person_id: pid,
      vocabulary: "interests_founder",
      term_key: k,
    })),
  ];
  if (interestRows.length) {
    const { error } = await supabase.from("person_interest").insert(interestRows);
    if (error) return { ok: false, error: error.message };
  }

  // Akquise-Kanäle (n:m) ersetzen
  {
    const { error } = await supabase
      .from("person_acquisition_channel")
      .delete()
      .eq("person_id", pid);
    if (error) return { ok: false, error: error.message };
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
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/profil");
  return { ok: true };
}

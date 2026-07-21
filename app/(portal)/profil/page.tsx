import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ProfileForm } from "./ProfileForm";
import type { ProfileInput } from "./actions";

export const dynamic = "force-dynamic";

type Term = {
  vocabulary: string;
  key: string;
  label_de: string;
  parent_key: string | null;
};
type Opt = { key: string; label: string };

export default async function ProfilPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Person anlegen bzw. migrierte Person claimen (idempotent).
  await supabase.rpc("claim_or_create_person");

  const [{ data: person }, { data: terms }, { data: interests }, { data: channels }] =
    await Promise.all([
      supabase
        .from("person")
        .select(
          "first_name,last_name,birthdate,gender,nationality,country,preferred_language,phone,linkedin_url,occupation_status,work_experience,career_level,employer_type,employer_name,startup_phase,study_field,study_program,university,self_assessment",
        )
        .maybeSingle(),
      supabase
        .from("vocab_term")
        .select("vocabulary,key,label_de,parent_key")
        .eq("active", true)
        .order("sort_order"),
      supabase.from("person_interest").select("vocabulary,term_key"),
      supabase.from("person_acquisition_channel").select("term_key"),
    ]);

  const allTerms = (terms ?? []) as Term[];
  const byVocab = (v: string): Opt[] =>
    allTerms.filter((t) => t.vocabulary === v).map((t) => ({ key: t.key, label: t.label_de }));

  const programsByField: Record<string, Opt[]> = {};
  for (const t of allTerms) {
    if (t.vocabulary === "study_program" && t.parent_key) {
      (programsByField[t.parent_key] ??= []).push({ key: t.key, label: t.label_de });
    }
  }

  const vocab = {
    occupation_status: byVocab("occupation_status"),
    work_experience: byVocab("work_experience"),
    career_level: byVocab("career_level"),
    employer_type: byVocab("employer_type"),
    study_field: byVocab("study_field"),
    self_assessment: byVocab("self_assessment"),
    gender: byVocab("gender"),
    startup_phase: byVocab("startup_phase"),
    interests: byVocab("interests"),
    interests_founder: byVocab("interests_founder"),
    acquisition_channel: byVocab("acquisition_channel"),
    programsByField,
  };

  const initial: ProfileInput = {
    first_name: person?.first_name ?? "",
    last_name: person?.last_name ?? "",
    birthdate: person?.birthdate ?? "",
    gender: person?.gender ?? "",
    nationality: person?.nationality ?? "",
    country: person?.country ?? "",
    preferred_language: person?.preferred_language ?? "de",
    phone: person?.phone ?? "",
    linkedin_url: person?.linkedin_url ?? "",
    occupation_status: person?.occupation_status ?? "",
    work_experience: person?.work_experience ?? "",
    career_level: person?.career_level ?? "",
    employer_type: person?.employer_type ?? "",
    employer_name: person?.employer_name ?? "",
    startup_phase: person?.startup_phase ?? "",
    study_field: person?.study_field ?? "",
    study_program: person?.study_program ?? "",
    university: person?.university ?? "",
    self_assessment: person?.self_assessment ?? "",
    interests: (interests ?? [])
      .filter((i: { vocabulary: string }) => i.vocabulary === "interests")
      .map((i: { term_key: string }) => i.term_key),
    interests_founder: (interests ?? [])
      .filter((i: { vocabulary: string }) => i.vocabulary === "interests_founder")
      .map((i: { term_key: string }) => i.term_key),
    channels: (channels ?? []).map((c: { term_key: string }) => c.term_key),
  };

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Mein Profil</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Angemeldet als {user.email}. Deine Daten pflegst du hier einmal — sie gelten
        formatübergreifend.
      </p>
      <ProfileForm vocab={vocab} initial={initial} />
    </main>
  );
}

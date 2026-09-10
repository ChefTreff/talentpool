import { redirect } from "next/navigation";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { pickLabel } from "@/lib/vocab";
import { PageHeader } from "@/components/ui/PageHeader";
import { Wizard } from "./Wizard";
import type { WizardData } from "./types";

export const dynamic = "force-dynamic";

type Term = {
  vocabulary: string;
  key: string;
  label_de: string;
  label_en: string | null;
};

export default async function OnboardingPage() {
  await requireArea("talent", "/onboarding");
  const { locale, t } = await getI18n();
  const supabase = await createSupabaseServerClient();

  // Person anlegen bzw. migrierte Person claimen (idempotent).
  await supabase.rpc("claim_or_create_person");

  const [{ data: person }, { data: terms }, { data: interests }, { data: consents }] =
    await Promise.all([
      supabase
        .from("person")
        .select(
          "first_name,last_name,preferred_language,city,country,occupation_status,career_level,employer_name,study_field,university",
        )
        .maybeSingle(),
      supabase
        .from("vocab_term")
        .select("vocabulary,key,label_de,label_en")
        .eq("active", true)
        .in("vocabulary", [
          "occupation_status",
          "career_level",
          "study_field",
          "interests",
          "interests_founder",
          "consent_type",
        ])
        .order("sort_order"),
      supabase.from("person_interest").select("vocabulary,term_key"),
      supabase.from("consent_current").select("consent_type,granted"),
    ]);

  const allTerms = (terms ?? []) as Term[];
  const byVocab = (v: string) =>
    allTerms
      .filter((term) => term.vocabulary === v)
      .map((term) => ({ key: term.key, label: pickLabel(term, locale) }));

  const consentLabel = (key: string) => {
    const term = allTerms.find((x) => x.vocabulary === "consent_type" && x.key === key);
    return term ? pickLabel(term, locale) : key;
  };

  const granted = new Map(
    ((consents ?? []) as { consent_type: string; granted: boolean }[]).map((c) => [
      c.consent_type,
      c.granted,
    ]),
  );

  // Wer Pflichtfelder und beide Pflicht-Einwilligungen hat, ist durch.
  const done =
    Boolean(person?.first_name?.trim()) &&
    Boolean(person?.last_name?.trim()) &&
    granted.get("terms") === true &&
    granted.get("privacy") === true;
  if (done) redirect("/profil");

  const initial: WizardData = {
    first_name: person?.first_name ?? "",
    last_name: person?.last_name ?? "",
    preferred_language: person?.preferred_language ?? locale,
    city: person?.city ?? "",
    country: person?.country ?? "",
    occupation_status: person?.occupation_status ?? "",
    career_level: person?.career_level ?? "",
    employer_name: person?.employer_name ?? "",
    study_field: person?.study_field ?? "",
    university: person?.university ?? "",
    interests: ((interests ?? []) as { vocabulary: string; term_key: string }[])
      .filter((i) => i.vocabulary === "interests")
      .map((i) => i.term_key),
    interests_founder: ((interests ?? []) as { vocabulary: string; term_key: string }[])
      .filter((i) => i.vocabulary === "interests_founder")
      .map((i) => i.term_key),
    consents: {
      terms: granted.get("terms") ?? false,
      privacy: granted.get("privacy") ?? false,
      photo_video: granted.get("photo_video") ?? false,
      newsletter: granted.get("newsletter") ?? false,
    },
  };

  return (
    // Der Wizard ist ein Formular: 800 px wie die Formularspalte im
    // Design-Briefing (§4) und wie /profil, nicht die 1200 des Bereichs.
    <div className="max-w-[800px]">
      <PageHeader
        eyebrow={t.onboarding.eyebrow}
        title={t.onboarding.title}
        description={t.onboarding.lead}
      />
      <Wizard
        initial={initial}
        vocab={{
          occupation_status: byVocab("occupation_status"),
          career_level: byVocab("career_level"),
          study_field: byVocab("study_field"),
          interests: byVocab("interests"),
          interests_founder: byVocab("interests_founder"),
        }}
        consentLabels={{
          terms: consentLabel("terms"),
          privacy: consentLabel("privacy"),
          photo_video: consentLabel("photo_video"),
          newsletter: consentLabel("newsletter"),
        }}
        languages={[
          { key: "de", label: "Deutsch" },
          { key: "en", label: "English" },
        ]}
        t={t.onboarding}
        common={{
          back: t.common.back,
          next: t.common.next,
          save: t.common.save,
          saving: t.common.saving,
          choose: t.common.choose,
          required: t.common.required,
        }}
        messages={t.messages}
      />
    </div>
  );
}

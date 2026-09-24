import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { pickLabel } from "@/lib/vocab";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProfileForm } from "./ProfileForm";
import { PortraitUpload } from "./PortraitUpload";
import { PORTRAIT_BUCKET, PORTRAIT_URL_SECONDS } from "./portraet";
import { CvUpload } from "./CvUpload";
import { ConsentForm } from "./ConsentForm";
import { CV_BUCKET, EDITABLE_CONSENTS, REQUIRED_CONSENTS, type ExtendedProfile } from "./felder";
import type { ProfileInput } from "./actions";

export const dynamic = "force-dynamic";

type Term = {
  vocabulary: string;
  key: string;
  label_de: string;
  label_en: string | null;
  parent_key: string | null;
};
type Opt = { key: string; label: string };

export default async function ProfilPage() {
  const user = await requireUser("/profil");
  const { locale, t } = await getI18n();

  const supabase = await createSupabaseServerClient();
  // Person anlegen bzw. migrierte Person claimen (idempotent).
  await supabase.rpc("claim_or_create_person");

  // Zuerst nur die Person: wer das Onboarding noch nicht hinter sich hat, wird
  // dorthin geschickt — ein halbes Profil hilft weder dem Badge noch dem
  // Matching. Das Vokabular für diese Seite zu laden wäre dann umsonst.
  const { data: person } = await supabase
    .from("person")
    .select(
      "first_name,last_name,birthdate,gender,nationality,country,preferred_language,phone,linkedin_url,occupation_status,work_experience,career_level,employer_type,employer_name,startup_phase,study_field,study_program,university,self_assessment,city",
    )
    .maybeSingle();

  if (!person?.first_name?.trim() || !person?.last_name?.trim()) {
    redirect("/onboarding");
  }

  const [
    { data: terms },
    { data: interests },
    { data: channels },
    { data: personId },
    { data: consentRows },
  ] = await Promise.all([
    supabase
      .from("vocab_term")
      .select("vocabulary,key,label_de,label_en,parent_key")
      .eq("active", true)
      .order("sort_order"),
    supabase.from("person_interest").select("vocabulary,term_key"),
    supabase.from("person_acquisition_channel").select("term_key"),
    supabase.rpc("current_person_id"),
    supabase.from("consent_current").select("consent_type,granted"),
  ]);

  // Eigene Abfrage statt Teil der Personenzeile oben: ohne die Spalte
  // `photo_path` (Migration v6_person_portraet) liefert sie nur einen Fehler,
  // und das Profil bleibt trotzdem benutzbar. Nach Id gefiltert, weil das Team
  // per RLS mehr als die eigene Zeile sieht.
  const { data: portrait } =
    typeof personId === "string"
      ? await supabase.from("person").select("photo_path").eq("id", personId).maybeSingle()
      : { data: null };

  const photoPath = (portrait as { photo_path: string | null } | null)?.photo_path ?? null;
  let photoUrl: string | null = null;
  if (photoPath) {
    const { data: signed } = await supabase.storage
      .from(PORTRAIT_BUCKET)
      .createSignedUrl(photoPath, PORTRAIT_URL_SECONDS);
    photoUrl = signed?.signedUrl ?? null;
  }

  // Die Felder aus TAL-013 (Migration v6_profilfelder). Schlägt die Abfrage
  // fehl, ist die Migration noch nicht live: dann fehlen die neuen Abschnitte,
  // und das Profil speichert wie bisher.
  type ExtRow = {
    job_title: string | null;
    study_program_label: string | null;
    job_openness: string | null;
    function_area: string | null;
    graduation_year: number | null;
    availability: string | null;
    mobility: string | null;
    cv_path: string | null;
  };
  const [{ data: extRow, error: extErr }, { data: languageRows }] =
    typeof personId === "string"
      ? await Promise.all([
          supabase
            .from("person")
            .select("job_title,study_program_label,job_openness,function_area,graduation_year,availability,mobility,cv_path")
            .eq("id", personId)
            .maybeSingle(),
          supabase.from("person_language").select("language,level").eq("person_id", personId),
        ])
      : [{ data: null, error: null }, { data: null }];
  const ext = extErr ? null : ((extRow ?? null) as ExtRow | null);

  let cvUrl: string | null = null;
  if (ext?.cv_path) {
    const { data: signed } = await supabase.storage
      .from(CV_BUCKET)
      .createSignedUrl(ext.cv_path, PORTRAIT_URL_SECONDS);
    cvUrl = signed?.signedUrl ?? null;
  }

  const consentMap = new Map(
    ((consentRows ?? []) as { consent_type: string; granted: boolean }[]).map((c) => [
      c.consent_type,
      c.granted,
    ]),
  );

  const allTerms = (terms ?? []) as Term[];
  const byVocab = (v: string): Opt[] =>
    allTerms
      .filter((term) => term.vocabulary === v)
      .map((term) => ({ key: term.key, label: pickLabel(term, locale) }));

  const consentLabelOf = (key: string) => {
    const term = allTerms.find((x) => x.vocabulary === "consent_type" && x.key === key);
    return term ? pickLabel(term, locale) : key;
  };

  const programsByField: Record<string, Opt[]> = {};
  for (const term of allTerms) {
    if (term.vocabulary === "study_program" && term.parent_key) {
      (programsByField[term.parent_key] ??= []).push({
        key: term.key,
        label: pickLabel(term, locale),
      });
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
    career_opportunities: byVocab("career_opportunities"),
    summit_goal: byVocab("summit_goal"),
    skill: byVocab("skill"),
    work_mode: byVocab("work_mode"),
    job_openness: byVocab("job_openness"),
    function_area: byVocab("function_area"),
    availability: byVocab("availability"),
    mobility: byVocab("mobility"),
    spoken_language: byVocab("spoken_language"),
    language_level: byVocab("language_level"),
    programsByField,
  };

  const termsOf = (vocabulary: string) =>
    ((interests ?? []) as { vocabulary: string; term_key: string }[])
      .filter((i) => i.vocabulary === vocabulary)
      .map((i) => i.term_key);

  const initial: ProfileInput = {
    first_name: person?.first_name ?? "",
    last_name: person?.last_name ?? "",
    birthdate: person?.birthdate ?? "",
    gender: person?.gender ?? "",
    nationality: person?.nationality ?? "",
    country: person?.country ?? "",
    preferred_language: person?.preferred_language ?? locale,
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
    city: person?.city ?? "",
    interests: (interests ?? [])
      .filter((i: { vocabulary: string }) => i.vocabulary === "interests")
      .map((i: { term_key: string }) => i.term_key),
    interests_founder: (interests ?? [])
      .filter((i: { vocabulary: string }) => i.vocabulary === "interests_founder")
      .map((i: { term_key: string }) => i.term_key),
    career_opportunities: termsOf("career_opportunities"),
    summit_goal: termsOf("summit_goal"),
    skill: termsOf("skill"),
    work_mode: termsOf("work_mode"),
    channels: (channels ?? []).map((c: { term_key: string }) => c.term_key),
    extended: ext
      ? ({
          job_title: ext.job_title ?? "",
          study_program_label: ext.study_program_label ?? "",
          job_openness: ext.job_openness ?? "",
          function_area: ext.function_area ?? "",
          graduation_year: ext.graduation_year ? String(ext.graduation_year) : "",
          availability: ext.availability ?? "",
          mobility: ext.mobility ?? "",
          languages: ((languageRows ?? []) as { language: string; level: string }[]).map((l) => ({
            language: l.language,
            level: l.level,
          })),
        } satisfies ExtendedProfile)
      : null,
  };

  return (
    <div className="max-w-text">
      <PageHeader
        title={t.profile.title}
        description={`${t.profile.lead} ${t.profile.loggedInAs} ${user.email}.`}
      />
      {typeof personId === "string" && (
        <div className="mb-6">
          <PortraitUpload
            personId={personId}
            name={person?.first_name ?? ""}
            photoUrl={photoUrl}
            t={t.profile.portrait}
            rpcMessages={t.rpc}
          />
        </div>
      )}
      <ProfileForm
        vocab={vocab}
        initial={initial}
        t={{
          sections: t.profile.sections,
          completeHint: t.profile.completeHint,
          addLanguage: t.profile.addLanguage,
          removeLanguage: t.profile.removeLanguage,
          fields: t.profile.fields,
          hints: t.profile.hints,
          choose: t.common.choose,
          save: t.common.save,
          saving: t.common.saving,
          saved: t.common.saved,
          messages: t.messages,
          // Sprachnamen stehen bewusst in der jeweiligen Sprache (Endonym) und
          // werden deshalb nicht übersetzt.
          languages: [
            { key: "de", label: "Deutsch" },
            { key: "en", label: "English" },
          ],
        }}
      />

      {ext && typeof personId === "string" && (
        <div className="mt-4">
          <CvUpload
            personId={personId}
            cvUrl={cvUrl}
            t={t.profile.cv}
            rpcMessages={t.rpc}
          />
        </div>
      )}

      <div className="mt-4">
        <ConsentForm
          editable={EDITABLE_CONSENTS.map((key) => ({
            key,
            label: consentLabelOf(key),
            hint: t.profile.consents.hints[key],
            granted: consentMap.get(key) === true,
          }))}
          required={REQUIRED_CONSENTS.map((key) => ({
            key,
            label: consentLabelOf(key),
            granted: consentMap.get(key) === true,
          }))}
          t={t.profile.consents}
          common={{ save: t.common.save, saving: t.common.saving, saved: t.common.saved }}
        />
      </div>

      {/* Am Fuss der Seite, ruhig und ohne Warnfarbe: der Weg soll zu finden
          sein, aber nicht neben „Speichern" um Aufmerksamkeit ringen. */}
      <p className="ct-help mt-8 border-t pt-6 text-muted">
        <Link href="/profil/loeschen" className="ct-link">
          {t.deleteProfile.link}
        </Link>
      </p>
    </div>
  );
}

import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { PageHeader } from "@/components/ui/PageHeader";
import { ApplyForm } from "./ApplyForm";
import { ProfileView } from "./ProfileView";
import { getVolunteerScope } from "./scope";

export const dynamic = "force-dynamic";

/**
 * Bewerbung und Profil. Ohne Bewerbung steht hier der Wizard, danach der
 * Stand — Schichten teilt das Team zu (Antwort 26), nicht die Person.
 */
export default async function VolunteersPage() {
  const { locale, t } = await getI18n();
  const { profile, days, edition } = await getVolunteerScope();

  const supabase = await createSupabaseServerClient();
  const [vocab, { data: consentTerms }] = await Promise.all([
    loadVocabMap(supabase, locale),
    supabase
      .from("vocab_term")
      .select("key,label_de,label_en")
      .eq("vocabulary", "consent_type")
      .in("key", ["terms", "privacy", "photo_video"]),
  ]);
  const consentLabels = Object.fromEntries(
    ((consentTerms ?? []) as { key: string; label_de: string; label_en: string | null }[]).map(
      (c) => [c.key, (locale === "en" ? c.label_en : c.label_de) ?? c.label_de],
    ),
  );

  const shirtSizes = vgroup(vocab, "shirt_size");
  const areas = vgroup(vocab, "volunteer_area");

  return (
    <>
      <PageHeader
        title={t.volunteers.title}
        description={edition?.name ? `${t.volunteers.lead} · ${edition.name}` : t.volunteers.lead}
      />
      {profile ? (
        <ProfileView
          profile={profile}
          days={days}
          shirtSizes={shirtSizes}
          areas={areas}
          locale={locale}
          dateLocale={t.meta.dateLocale}
          t={t.volunteers}
          common={{ cancel: t.common.cancel, save: t.common.save }}
          rpcMessages={t.rpc}
        />
      ) : (
        <ApplyForm
          days={days}
          shirtSizes={shirtSizes}
          areas={areas}
          firstDay={edition?.start_date ?? null}
          locale={locale}
          dateLocale={t.meta.dateLocale}
          t={t.volunteers}
          common={{ back: t.common.back, next: t.common.next, save: t.common.save }}
          consentLabels={consentLabels}
          rpcMessages={t.rpc}
        />
      )}
    </>
  );
}

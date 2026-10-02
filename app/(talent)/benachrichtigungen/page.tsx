import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { pickLabel } from "@/lib/vocab";
import { PageHeader } from "@/components/ui/PageHeader";
import { ThemenWahl } from "./ThemenWahl";

export const dynamic = "force-dynamic";

/**
 * „Worüber möchtest du informiert werden?“ (TAL-009). Die Themen sind ein
 * Vokabular (`notification_topic`, Pflege in `/admin/vokabular`) und schränken
 * die Newsletter-Einwilligung nur ein (K-43). Kanal ist E-Mail; Frequenz und
 * WhatsApp gibt es nicht (Feldvorschlag TAL-013, C4/C5).
 */
export default async function BenachrichtigungenPage() {
  const { personId } = await requireArea("talent", "/benachrichtigungen");
  const { locale, t } = await getI18n();
  const supabase = await createSupabaseServerClient();

  const [{ data: themen }, { data: gewaehlt }, { data: consent }] = await Promise.all([
    supabase.from("vocab_term").select("key,label_de,label_en").eq("vocabulary", "notification_topic").eq("active", true).order("sort_order"),
    supabase.from("person_interest").select("term_key").eq("person_id", personId ?? "").eq("vocabulary", "notification_topic"),
    supabase.from("consent_current").select("granted").eq("consent_type", "newsletter").maybeSingle(),
  ]);

  const s = t.talentNotifications;
  return (
    <>
      <PageHeader title={s.title} description={s.lead} />
      <ThemenWahl
        themen={((themen ?? []) as { key: string; label_de: string; label_en: string | null }[]).map((x) => ({
          key: x.key,
          label: pickLabel(x, locale),
        }))}
        gewaehlt={((gewaehlt ?? []) as { term_key: string }[]).map((x) => x.term_key)}
        newsletter={Boolean((consent as { granted: boolean } | null)?.granted)}
        t={s}
      />
    </>
  );
}

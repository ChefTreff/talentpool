import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { PageHeader } from "@/components/ui/PageHeader";
import { FeedbackForm } from "./FeedbackForm";

export const dynamic = "force-dynamic";

/** Feedback-Fenster (TAL-011): jederzeit, zu jedem Format, wahlweise wirklich anonym. */
export default async function FeedbackPage() {
  await requireArea("talent", "/feedback");
  const { locale, t } = await getI18n();
  const supabase = await createSupabaseServerClient();
  const vocab = await loadVocabMap(supabase, locale);
  const opt = (v: string) => Object.entries(vgroup(vocab, v)).map(([value, label]) => ({ value, label }));
  const s = t.talentFeedback as unknown as Record<string, string>;
  return (
    <>
      <PageHeader title={s.title} description={s.lead} />
      <FeedbackForm formate={opt("feedback_format")} arten={opt("feedback_kind")} gruende={opt("feedback_reason")} t={s} rpcMessages={t.rpc} />
    </>
  );
}

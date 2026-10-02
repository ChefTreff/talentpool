import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { Card, CardHeader, StatCard } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { FeedbackListe, type FeedbackZeile } from "./FeedbackListe";

export const dynamic = "force-dynamic";

/** Feedback im Admin (TAL-011): Summit-Mittelwerte und die Einsendungen zum Sichten. */
export default async function AdminFeedbackPage() {
  await requireAdminSection("feedback", "/admin/feedback");
  const { locale, t } = await getI18n();
  const s = t.adminFeedback as unknown as Record<string, string>;
  const supabase = await createSupabaseServerClient();
  const [{ data }, { data: summary }, vocab] = await Promise.all([
    supabase.rpc("feedback_admin"),
    supabase.rpc("feedback_summit_summary"),
    loadVocabMap(supabase, locale),
  ]);
  const zahl = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const mittel = (summary ?? []) as { question: string; answers: number; average: number | null }[];
  return (
    <>
      <PageHeader word={t.admin.words.feedback} title={s.title} description={s.lead} />
      <div className="flex flex-col gap-6">
        {mittel.some((m) => m.answers > 0) && (
          <Card>
            <CardHeader title={s.summaryTitle} description={s.summaryLead} />
            <div className="grid gap-3 sm:grid-cols-3">
              {mittel.map((m) => (
                <StatCard key={m.question} label={s[`q_${m.question}`] ?? m.question}
                  value={m.average == null ? "—" : `${zahl.format(m.average)} / 5`}
                  hint={s.answers.replace("{n}", String(m.answers))} />
              ))}
            </div>
          </Card>
        )}
        <Card>
          <CardHeader title={s.listTitle} description={s.listLead} />
          <FeedbackListe rows={(data ?? []) as FeedbackZeile[]}
            labels={{ formats: vgroup(vocab, "feedback_format"), kinds: vgroup(vocab, "feedback_kind"), reasons: vgroup(vocab, "feedback_reason") }}
            t={s} />
        </Card>
      </div>
    </>
  );
}

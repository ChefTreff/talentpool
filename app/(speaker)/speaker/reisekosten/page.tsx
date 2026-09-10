import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { ExpenseWizard } from "./ExpenseWizard";
import type { SpeakerProfile } from "../types";
import { EDITABLE, type ExpenseClaim, type ExpenseEligibility } from "./types";

export const dynamic = "force-dynamic";

export default async function SpeakerExpensePage() {
  await requireArea("speaker", "/speaker/reisekosten");
  const { locale, t } = await getI18n("en");
  const supabase = await createSupabaseServerClient();

  const [{ data: profileJson }, { data: eligibilityJson }, { data: claimRows }, vocab] =
    await Promise.all([
      supabase.rpc("my_speaker_profile"),
      supabase.rpc("expense_eligibility"),
      supabase.rpc("my_expense_claims"),
      loadVocabMap(supabase, locale),
    ]);

  const profile = (profileJson ?? null) as SpeakerProfile | null;
  const eligibility = (eligibilityJson ?? null) as ExpenseEligibility | null;

  if (!profile || !eligibility) {
    return (
      <>
        <PageHeader title={t.speaker.expenseTitle} description={t.speaker.expenseLead} />
        <EmptyState title={t.speaker.noProfileTitle} description={t.speaker.noProfileBody} />
      </>
    );
  }

  const claims = (claimRows ?? []) as ExpenseClaim[];
  // Der bearbeitbare Antrag bestimmt den Zustand des Formulars. Er steckt im
  // `key`, damit der Wizard nach dem Einreichen neu aufsetzt und nicht mit den
  // Zeilen von eben weiterläuft.
  const open = claims.find((c) => EDITABLE.includes(c.status)) ?? null;

  return (
    <div className="max-w-[900px]">
      <PageHeader title={t.speaker.expenseTitle} description={t.speaker.expenseLead} />
      <ExpenseWizard
        key={open?.id ?? claims[0]?.id ?? "leer"}
        profileId={profile.id}
        editionId={profile.edition_id}
        eligibility={eligibility}
        claims={claims}
        categories={vgroup(vocab, "expense_category")}
        dateLocale={t.meta.dateLocale}
        t={t.speaker}
        common={{
          cancel: t.common.cancel,
          choose: t.common.choose,
          none: t.common.none,
          required: t.common.required,
          save: t.common.save,
        }}
        rpcMessages={t.rpc}
      />
    </div>
  );
}

import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { getVolunteerScope } from "../scope";
import { LeadShifts, type LeadShift } from "./LeadShifts";

export const dynamic = "force-dynamic";

/**
 * Sicht der Bereichsleitung: die eigenen Schichten und wer darauf steht.
 *
 * Kein Gate auf der Route nötig — `my_lead_shifts()` gibt nur Schichten
 * heraus, bei denen die anfragende Person als Leitung eingetragen ist. Wer
 * keine hat, sieht eine leere Seite mit Erklärung.
 */
export default async function VolunteerLeadPage() {
  const { locale, t } = await getI18n();
  const { days, edition } = await getVolunteerScope();

  const supabase = await createSupabaseServerClient();
  const [{ data: rows }, vocab] = await Promise.all([
    supabase.rpc("my_lead_shifts"),
    loadVocabMap(supabase, locale),
  ]);
  const shifts = (rows ?? []) as LeadShift[];
  const dayLabels = Object.fromEntries(
    days.map((d) => [d.id, (locale === "en" ? d.label_en : d.label_de) ?? d.day_date]),
  );

  return (
    <>
      <PageHeader title={t.volunteers.leadTitle} description={t.volunteers.leadLead} />
      {shifts.length === 0 ? (
        <EmptyState
          title={t.volunteers.leadEmptyTitle}
          description={t.volunteers.leadEmptyBody}
        />
      ) : (
        <LeadShifts
          shifts={shifts}
          areas={vgroup(vocab, "volunteer_area")}
          dayLabels={dayLabels}
          dateLocale={t.meta.dateLocale}
          timeZone={edition?.timezone ?? "Europe/Berlin"}
          t={t.volunteers}
          common={{ none: t.common.none }}
        />
      )}
    </>
  );
}

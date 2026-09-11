import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { getVolunteerScope } from "../scope";
import { canSeeShifts, type MyShift } from "../types";
import { ShiftList } from "./ShiftList";

export const dynamic = "force-dynamic";

/** Meine Schichten: bestätigen oder absagen. Zugeteilt wird im Team. */
export default async function VolunteerShiftsPage() {
  const { locale, t } = await getI18n();
  const { profile, edition } = await getVolunteerScope();

  const supabase = await createSupabaseServerClient();
  const [{ data: rows }, vocab] = await Promise.all([
    supabase.rpc("my_shifts"),
    loadVocabMap(supabase, locale),
  ]);
  const shifts = (rows ?? []) as MyShift[];

  return (
    <>
      <PageHeader title={t.volunteers.shiftsTitle} description={t.volunteers.shiftsLead} />
      {!canSeeShifts(profile) ? (
        <EmptyState
          title={t.volunteers.shiftsLockedTitle}
          description={
            profile ? t.volunteers.shiftsLockedBody : t.volunteers.shiftsNoProfileBody
          }
        />
      ) : shifts.length === 0 ? (
        <EmptyState
          title={t.volunteers.shiftsEmptyTitle}
          description={t.volunteers.shiftsEmptyBody}
        />
      ) : (
        <ShiftList
          shifts={shifts}
          areas={vgroup(vocab, "volunteer_area")}
          locale={locale}
          dateLocale={t.meta.dateLocale}
          timeZone={edition?.timezone ?? "Europe/Berlin"}
          t={t.volunteers}
          common={{ cancel: t.common.cancel }}
          rpcMessages={t.rpc}
        />
      )}
    </>
  );
}

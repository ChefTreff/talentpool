import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { SAFETY_VERSION } from "@/lib/volunteers/schichten";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { getVolunteerScope } from "../scope";
import { canSeeShifts, type MyShift, type VolunteerSafety, type WishableShift } from "../types";
import { SafetyCard } from "./SafetyCard";
import { ShiftList } from "./ShiftList";
import { WishPicker } from "./WishPicker";

export const dynamic = "force-dynamic";

/**
 * Meine Schichten: Unterweisung bestätigen, Wunschschichten angeben, Schichten bestätigen oder
 * absagen. Zugeteilt wird im Team (K-44).
 */
export default async function VolunteerShiftsPage() {
  const { locale, t } = await getI18n();
  const { profile, edition } = await getVolunteerScope();
  const accepted = canSeeShifts(profile);

  const supabase = await createSupabaseServerClient();
  const [{ data: rows }, vocab, safety, wishable] = await Promise.all([
    supabase.rpc("my_shifts"),
    loadVocabMap(supabase, locale),
    accepted ? supabase.rpc("my_volunteer_safety") : Promise.resolve({ data: null }),
    accepted ? supabase.rpc("wishable_shifts") : Promise.resolve({ data: null }),
  ]);
  const shifts = (rows ?? []) as MyShift[];
  const ack = ((safety.data ?? []) as VolunteerSafety[])[0] ?? null;
  const wishShifts = (wishable.data ?? []) as WishableShift[];
  const areas = vgroup(vocab, "volunteer_area");
  const timeZone = edition?.timezone ?? "Europe/Berlin";

  return (
    <>
      <PageHeader title={t.volunteers.shiftsTitle} description={t.volunteers.shiftsLead} />
      {!accepted ? (
        <EmptyState
          title={t.volunteers.shiftsLockedTitle}
          description={profile ? t.volunteers.shiftsLockedBody : t.volunteers.shiftsNoProfileBody}
        />
      ) : (
        <div className="flex flex-col gap-6">
          <SafetyCard
            acknowledgedAt={ack?.acknowledged_at ?? null}
            version={SAFETY_VERSION}
            dateLocale={t.meta.dateLocale}
            t={t.volunteers}
            rpcMessages={t.rpc}
          />
          <WishPicker
            shifts={wishShifts}
            areas={areas}
            locale={locale}
            dateLocale={t.meta.dateLocale}
            timeZone={timeZone}
            t={t.volunteers}
            rpcMessages={t.rpc}
          />
          {shifts.length === 0 ? (
            <EmptyState title={t.volunteers.shiftsEmptyTitle} description={t.volunteers.shiftsEmptyBody} />
          ) : (
            <ShiftList
              shifts={shifts}
              areas={areas}
              locale={locale}
              dateLocale={t.meta.dateLocale}
              timeZone={timeZone}
              safetyAcked={Boolean(ack?.acknowledged_at)}
              t={t.volunteers}
              common={{ cancel: t.common.cancel }}
              rpcMessages={t.rpc}
            />
          )}
        </div>
      )}
    </>
  );
}

import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { TravelView } from "./TravelView";
import type { SpeakerProfile } from "../types";
import type { HospitalityBooking, HospitalityOption } from "./types";

export const dynamic = "force-dynamic";

export default async function SpeakerTravelPage() {
  await requireArea("speaker", "/speaker/travel");
  const { locale, t } = await getI18n("en");
  const supabase = await createSupabaseServerClient();

  const [{ data: profileJson }, { data: optionRows }, { data: bookingRows }, vocab] =
    await Promise.all([
      supabase.rpc("my_speaker_profile"),
      supabase.rpc("hospitality_options"),
      supabase.rpc("my_hospitality"),
      loadVocabMap(supabase, locale),
    ]);

  const profile = (profileJson ?? null) as SpeakerProfile | null;

  if (!profile) {
    return (
      <>
        <PageHeader title={t.speaker.travelTitle} description={t.speaker.travelLead} />
        <EmptyState title={t.speaker.noProfileTitle} description={t.speaker.noProfileBody} />
      </>
    );
  }

  return (
    <div className="max-w-[900px]">
      <PageHeader title={t.speaker.travelTitle} description={t.speaker.travelLead} />
      <TravelView
        isAssistant={profile.is_assistant}
        hospitalityStatus={profile.hospitality_status}
        options={(optionRows ?? []) as HospitalityOption[]}
        bookings={(bookingRows ?? []) as HospitalityBooking[]}
        tierLabels={vgroup(vocab, "hotel_tier")}
        locale={locale}
        dateLocale={t.meta.dateLocale}
        t={t.speaker}
        common={{
          cancel: t.common.cancel,
          choose: t.common.choose,
          none: t.common.none,
          save: t.common.save,
        }}
        rpcMessages={t.rpc}
      />
    </div>
  );
}

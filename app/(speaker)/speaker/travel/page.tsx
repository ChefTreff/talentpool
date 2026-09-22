import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Anreise, type SpeakerTravel } from "./Anreise";
import { DietCard } from "@/components/diet/DietCard";
import { ShuttleView } from "./ShuttleView";
import { TravelView } from "./TravelView";
import type { SpeakerProfile } from "../types";
import type {
  HospitalityBooking,
  HospitalityOption,
  ShuttleBooking,
} from "./types";

export const dynamic = "force-dynamic";

export default async function SpeakerTravelPage() {
  await requireArea("speaker", "/speaker/travel");
  const { locale, t } = await getI18n("en");
  const supabase = await createSupabaseServerClient();

  const [
    { data: profileJson },
    { data: optionRows },
    { data: bookingRows },
    { data: travelJson },
    { data: dietJson },
    vocab,
  ] = await Promise.all([
    supabase.rpc("my_speaker_profile"),
    supabase.rpc("hospitality_options"),
    supabase.rpc("my_hospitality"),
    supabase.rpc("my_speaker_travel"),
    supabase.rpc("my_diet"),
    loadVocabMap(supabase, locale),
  ]);
  // Fahrten stehen seit 0119 in einer eigenen Tabelle, nicht mehr als
  // Kontingentbuchung — deshalb ein eigener Aufruf.
  const { data: shuttleRows } = await supabase.rpc("my_shuttle_bookings");

  const profile = (profileJson ?? null) as SpeakerProfile | null;
  const travel = (travelJson ?? null) as SpeakerTravel | null;
  const diet = (dietJson ?? null) as {
    diet: string | null;
    diet_note: string | null;
  } | null;

  // Hotel und Kontingente nur für die, die welche bekommen (SPK-031). Die
  // Liste der Stati ist dieselbe wie in `hospitality_block_reason`, plus
  // `declined`: wer abgesagt hat, soll es zurücknehmen können, statt die
  // Sektion verschwinden zu sehen.
  //
  // **Anreise, Ernährung und Shuttle bleiben für alle stehen.** Die brauchen
  // wir von jedem Speaker — auch von dem, der mit dem eigenen Auto kommt und
  // kein Zimmer bekommt. Nur das Hotelangebot weckt Erwartungen, die wir für
  // diese Person nicht einlösen.
  const HOSPITALITY_ANSPRUCH = new Set([
    "eligible",
    "requested",
    "booked",
    "declined",
  ]);

  if (!profile) {
    return (
      <>
        <PageHeader
          title={t.speaker.travelTitle}
          description={t.speaker.travelLead}
        />
        <EmptyState
          title={t.speaker.noProfileTitle}
          description={t.speaker.noProfileBody}
        />
      </>
    );
  }

  return (
    <div className="max-w-[900px]">
      <PageHeader
        title={t.speaker.travelTitle}
        description={t.speaker.travelLead}
      />

      <div className="mb-6 flex flex-col gap-6">
        {/* An-/Abreise zuerst: sie steht am Anfang der Reise und entscheidet,
            ob ein Hotel überhaupt gebraucht wird. */}
        <Anreise
          travel={travel}
          isAssistant={profile.is_assistant}
          modes={vgroup(vocab, "travel_mode")}
          dateLocale={t.meta.dateLocale}
          t={t.speaker}
          common={{ save: t.common.save, choose: t.common.choose }}
          rpcMessages={t.rpc}
        />
        {/* Die Ernährung gehört hierher und nicht ins Profil: sie wird fürs
            Catering gebraucht, also dort, wo auch Hotel und Anreise stehen.
            **Nicht für die Assistenz**: sie darf die Angabe nicht lesen, sähe
            ein leeres Formular und würde beim Speichern eine hinterlegte
            Allergie löschen. */}
        {!profile.is_assistant && (
          <DietCard
            diet={diet?.diet ?? null}
            note={diet?.diet_note ?? null}
            path="/speaker/travel"
            options={vgroup(vocab, "diet")}
            t={t.diet}
            common={{ save: t.common.save, choose: t.common.choose }}
            rpcMessages={t.rpc}
          />
        )}
      </div>

      {/* Shuttle vor den Kontingenten: eine Fahrt ist ein Auftrag mit Zeit und
          Ziel, kein Platz in einem Topf. Wer hierher kommt, sucht meistens sie. */}
      <div className="mb-6">
        <ShuttleView
          profileId={profile.id}
          bookings={(shuttleRows ?? []) as ShuttleBooking[]}
          isAssistant={profile.is_assistant}
          dateLocale={t.meta.dateLocale}
          t={t.speaker}
          common={{ cancel: t.common.cancel, save: t.common.save }}
          rpcMessages={t.rpc}
        />
      </div>

      {HOSPITALITY_ANSPRUCH.has(profile.hospitality_status) && (
        <TravelView
          isAssistant={profile.is_assistant}
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
            yes: t.common.yes,
            no: t.common.no,
          }}
          rpcMessages={t.rpc}
        />
      )}
    </div>
  );
}

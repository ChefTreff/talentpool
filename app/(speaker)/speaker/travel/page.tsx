import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadActiveKeys, loadVocabMap, vgroup } from "@/lib/vocab";
import { loadSummit } from "@/lib/event-days";
import { formatDay } from "@/lib/tz";
import { EmptyState } from "@/components/ui/EmptyState";
import { AbschnittsNavigation, Sektion } from "@/components/ui/Abschnitte";
import { PageHeader } from "@/components/ui/PageHeader";
import { Anfahrt } from "./Anfahrt";
import { Anreise, type SpeakerTravel } from "./Anreise";
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
    vocab,
    reisemittel,
  ] = await Promise.all([
    supabase.rpc("my_speaker_profile"),
    supabase.rpc("hospitality_options"),
    supabase.rpc("my_hospitality"),
    supabase.rpc("my_speaker_travel"),
    loadVocabMap(supabase, locale),
    loadActiveKeys(supabase, "travel_mode"),
  ]);
  // Fahrten stehen seit 0119 in einer eigenen Tabelle, nicht mehr als
  // Kontingentbuchung — deshalb ein eigener Aufruf.
  const { data: shuttleRows } = await supabase.rpc("my_shuttle_bookings");

  const profile = (profileJson ?? null) as SpeakerProfile | null;
  const travel = (travelJson ?? null) as SpeakerTravel | null;

  if (!profile) {
    return (
      <>
        <PageHeader
          word={t.speaker.wordJourney}
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

  // --- Shuttle: Zeitfenster und Vorbelegung (SPK-032, SPK-034, SPK-061) -----
  // Konrad am 24.09.: Fahrten vom Anreisetag bis zum letzten Summit-Tag, am
  // Anreisetag ab 12 Uhr, sonst ab 9 Uhr, jeweils bis 21 Uhr. Der Anreisetag
  // ist der Tag **vor dem Summit** (Do 15.04.), nicht der vor der Edition: die
  // beginnt schon mit dem Hackathon am Donnerstag, und so war der Mittwoch in
  // die Auswahl geraten. Die Tage kommen aus den Daten, nicht aus dem Kopf —
  // 2028 verschiebt sich der Summit, die Regel nicht.
  const summit = await loadSummit(supabase, profile.edition_id);
  const ersterTag = summit.days[0] ?? null;
  const letzterTag = summit.days[summit.days.length - 1] ?? null;
  const anreisetag = ersterTag
    ? new Date(new Date(`${ersterTag}T00:00:00.000Z`).getTime() - 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10)
    : null;
  const fenster =
    anreisetag && letzterTag
      ? {
          min: `${anreisetag}T12:00`,
          max: `${letzterTag}T21:00`,
          tage: [
            { datum: anreisetag, von: 12, bis: 21 },
            ...summit.days.map((d) => ({ datum: d, von: 9, bis: 21 })),
          ],
          hint: t.speaker.shuttleWindowHint
            .replace("{von}", formatDay(anreisetag, t.meta.dateLocale, { withYear: false }))
            .replace("{bis}", formatDay(letzterTag, t.meta.dateLocale, { withYear: false })),
        }
      : undefined;

  // Was aus der Anreise schon bekannt ist, steht im Fahrtformular drin.
  const vorschlag: Record<string, string> = {};
  const name = [profile.person.first_name, profile.person.last_name]
    .filter(Boolean)
    .join(" ");
  if (name) vorschlag.passenger_name = name;
  if (travel?.arrival_date) {
    vorschlag.pickup_at = `${travel.arrival_date}T${(travel.arrival_time ?? "09:00").slice(0, 5)}`;
  }

  // Hotel und Kontingente nur für die, die welche bekommen (SPK-031). Die
  // Liste der Stati ist dieselbe wie in `hospitality_block_reason`, plus
  // `declined`: wer abgesagt hat, soll es zurücknehmen können, statt die
  // Sektion verschwinden zu sehen.
  //
  // **Anreise und Shuttle bleiben für alle stehen.** Die brauchen
  // wir von jedem Speaker — auch von dem, der mit dem eigenen Auto kommt und
  // kein Zimmer bekommt. Nur das Hotelangebot weckt Erwartungen, die wir für
  // diese Person nicht einlösen.
  const HOSPITALITY_ANSPRUCH = new Set([
    "eligible",
    "requested",
    "booked",
    "declined",
  ]);

  // Die Übersicht führt nur, was auf dieser Seite auch steht (SPK-035, Muster
  // QS-026): das Hotel hängt an Bedingungen, ein Anker ins Leere
  // wäre schlimmer als ein fehlender.
  const zeigtHotel = HOSPITALITY_ANSPRUCH.has(profile.hospitality_status);
  const abschnitte = [
    { id: "anfahrt", label: t.speaker.arrivalTitle },
    { id: "anreise", label: t.speaker.sectionArrival },
    { id: "shuttle", label: t.speaker.sectionShuttle },
    ...(zeigtHotel ? [{ id: "hotel", label: t.speaker.sectionHotel }] : []),
  ];

  return (
    <div className="max-w-detail">
      <PageHeader
        word={t.speaker.wordJourney}
        title={t.speaker.travelTitle}
        description={t.speaker.travelLead}
      />

      <AbschnittsNavigation label={t.speaker.sectionsLabel} items={abschnitte} />

      {/* Die Anfahrt zuerst: sie gilt für jeden, der kommt — auch für die
          ohne Zimmer. Vorher stand sie unten und steckte im Hotelteil. */}
      <Sektion id="anfahrt" className="mb-6">
        <Anfahrt t={t.speaker} />
      </Sektion>

      <div className="mb-6 flex flex-col gap-6">
        {/* An-/Abreise zuerst: sie steht am Anfang der Reise und entscheidet,
            ob ein Hotel überhaupt gebraucht wird. */}
        <Sektion id="anreise">
        <Anreise
          travel={travel}
          isAssistant={profile.is_assistant}
          modes={vgroup(vocab, "travel_mode")}
          angeboten={reisemittel}
          dateLocale={t.meta.dateLocale}
          t={t.speaker}
          common={{ save: t.common.save, choose: t.common.choose }}
          rpcMessages={t.rpc}
        />
        </Sektion>
        {/* Die Ernährung stand hier und steht seit SPK-056 im Profil: sie
            gehört zur Person, nicht zur Reise (Konrad 24.09.). */}
      </div>

      {/* Shuttle vor den Kontingenten: eine Fahrt ist ein Auftrag mit Zeit und
          Ziel, kein Platz in einem Topf. Wer hierher kommt, sucht meistens sie. */}
      <Sektion id="shuttle" className="mb-6">
        <ShuttleView
          profileId={profile.id}
          vorschlag={vorschlag}
          fenster={fenster}
          bookings={(shuttleRows ?? []) as ShuttleBooking[]}
          isAssistant={profile.is_assistant}
          dateLocale={t.meta.dateLocale}
          t={t.speaker}
          common={{ cancel: t.common.cancel, save: t.common.save }}
          rpcMessages={t.rpc}
        />
      </Sektion>

      {zeigtHotel && (
        <Sektion id="hotel">
        <TravelView
          isAssistant={profile.is_assistant}
          options={(optionRows ?? []) as HospitalityOption[]}
          bookings={(bookingRows ?? []) as HospitalityBooking[]}
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
        </Sektion>
      )}
    </div>
  );
}

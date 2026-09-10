import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vlabel } from "@/lib/vocab";
import { PageHeader } from "@/components/ui/PageHeader";
import { MeineView } from "./MeineView";
import type { MyApplication, MyRegistration, ParticipationSession } from "./types";

export const dynamic = "force-dynamic";

/**
 * „Meine Teilnahme" — Bewerbungen und Anmeldungen der angemeldeten Person.
 *
 * Der Stand kommt aus `my_applications()`; die RPC maskiert Entscheidungen bis
 * zur Freigabe, deshalb wird hier nichts nachgerechnet. `registration` ist per
 * RLS auf die eigene Person beschränkt, `programme_public` liefert nur
 * veröffentlichte Sessions — zieht das Programm-Team eine Session zurück,
 * bleibt die Bewerbung sichtbar, nur ohne Titel und Zeit.
 */
export default async function MeinePage() {
  await requireArea("talent", "/meine");
  const { locale, t } = await getI18n();
  const supabase = await createSupabaseServerClient();

  const [
    { data: applicationRows },
    { data: registrationRows },
    { data: sessionRows },
    { data: eventRows },
    { data: personId },
    { data: ticketRows },
    vocab,
  ] = await Promise.all([
    supabase.rpc("my_applications"),
    supabase
      .from("registration")
      .select("id, session_id, status, created_at")
      .not("session_id", "is", null),
    supabase.from("programme_public").select("*"),
    supabase.from("event").select("id, timezone"),
    supabase.rpc("current_person_id"),
    // Für den Ticketpflicht-Hinweis: nur die eigenen gültigen Tickets zählen.
    // `ticket_self_sel` zeigt auch gekaufte fremde Tickets, deshalb der
    // Vergleich auf `person_id` — genau wie in `confirm_application`.
    supabase.from("ticket").select("event_id, person_id").eq("status", "valid"),
    loadVocabMap(supabase, locale),
  ]);

  const sessionById = new Map(
    ((sessionRows ?? []) as ParticipationSession[]).map((s) => [s.session_id, s]),
  );
  // Nach dem Beginn der Session sortieren — das ist die Reihenfolge, in der man
  // seinen Tag liest. Sessions ohne Slot (oder zurückgezogene) ans Ende.
  const startOf = (sessionId: string) =>
    sessionById.get(sessionId)?.start_at ?? "\uffff";
  const byStart = (a: { session_id: string }, b: { session_id: string }) =>
    startOf(a.session_id).localeCompare(startOf(b.session_id));

  const applications = ((applicationRows ?? []) as MyApplication[]).slice().sort(byStart);
  // Stornierte Anmeldungen sind erledigt und gehören nicht in die Liste.
  const registrations = ((registrationRows ?? []) as MyRegistration[])
    .filter((r) => r.status !== "cancelled")
    .sort(byStart);

  const sessions = Object.fromEntries(sessionById);
  const ticketedEvents = ((ticketRows ?? []) as { event_id: string; person_id: string | null }[])
    .filter((t) => t.person_id != null && t.person_id === personId)
    .map((t) => t.event_id);
  const timezones = Object.fromEntries(
    ((eventRows ?? []) as { id: string; timezone: string }[]).map((e) => [
      e.id,
      e.timezone,
    ]),
  );

  const statusLabels = (vocabulary: string, keys: string[]) =>
    Object.fromEntries(keys.map((k) => [k, vlabel(vocab, vocabulary, k)]));

  return (
    <div className="max-w-[800px]">
      <PageHeader title={t.participation.title} description={t.participation.lead} />
      <MeineView
        applications={applications}
        registrations={registrations}
        sessions={sessions}
        timezones={timezones}
        ticketedEvents={ticketedEvents}
        labels={{
          applicationStatus: statusLabels("application_status", [
            "applied", "shortlisted", "accepted", "confirmed", "attended", "no_show",
            "waitlisted", "promoted", "declined", "expired", "withdrawn",
          ]),
          registrationStatus: statusLabels("registration_status", [
            "applied", "waitlisted", "confirmed", "declined", "no_response",
            "attended", "no_show", "cancelled",
          ]),
        }}
        locale={locale}
        dateLocale={t.meta.dateLocale}
        t={t.participation}
        common={{ cancel: t.common.cancel, none: t.common.none }}
        rpcMessages={t.rpc}
      />
    </div>
  );
}

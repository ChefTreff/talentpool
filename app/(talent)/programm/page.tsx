import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vlabel } from "@/lib/vocab";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProgrammeView } from "./ProgrammeView";
import type { MyApplication, ProgrammeSession, SessionQuestion } from "./types";

export const dynamic = "force-dynamic";

export default async function ProgrammPage() {
  await requireArea("talent", "/programm");
  const { locale, t } = await getI18n();
  const supabase = await createSupabaseServerClient();

  const [
    { data: sessionRows },
    { data: applicationRows },
    { data: registrationRows },
    { data: questionRows },
    { data: eventRows },
    vocab,
  ] = await Promise.all([
    // `programme_public` zeigt nur veröffentlichte Sessions — die Sichtbarkeits-
    // regel liegt in der View, nicht hier.
    supabase.from("programme_public").select("*").order("start_at"),
    supabase.rpc("my_applications"),
    supabase
      .from("registration")
      .select("session_id, status")
      .not("session_id", "is", null),
    supabase
      .from("session_question")
      .select("id, session_id, question_id, label_de, label_en, type, options, required, sort_order")
      .order("sort_order"),
    supabase.from("event").select("id, timezone"),
    loadVocabMap(supabase, locale),
  ]);

  const sessions = (sessionRows ?? []) as ProgrammeSession[];
  const timezoneByEvent = new Map(
    ((eventRows ?? []) as { id: string; timezone: string }[]).map((e) => [
      e.id,
      e.timezone,
    ]),
  );

  // Sitzungen ohne Slot haben keinen Tag — sie gehören nicht in einen Tag-Tab.
  const days = [...new Set(sessions.map((s) => s.day_date).filter(Boolean))].sort() as string[];
  const stages = [
    ...new Map(
      sessions
        .filter((s) => s.stage_id)
        .map((s) => [s.stage_id as string, s.stage_name ?? "—"]),
    ).entries(),
  ].map(([id, name]) => ({ id, name }));

  const labels = {
    format: Object.fromEntries(
      [...new Set(sessions.map((s) => s.format).filter(Boolean))].map((k) => [
        k as string,
        vlabel(vocab, "session_format", k),
      ]),
    ),
    language: Object.fromEntries(
      ["de", "en", "mixed"].map((k) => [k, vlabel(vocab, "language", k)]),
    ),
    accessMode: Object.fromEntries(
      ["open", "registration", "application"].map((k) => [
        k,
        vlabel(vocab, "access_mode", k),
      ]),
    ),
    applicationStatus: Object.fromEntries(
      [
        "applied", "shortlisted", "accepted", "confirmed", "attended", "no_show",
        "waitlisted", "promoted", "declined", "expired", "withdrawn",
      ].map((k) => [k, vlabel(vocab, "application_status", k)]),
    ),
  };

  if (sessions.length === 0) {
    return (
      <>
        <PageHeader title={t.programme.title} description={t.programme.lead} />
        <EmptyState title={t.programme.emptyTitle} description={t.programme.emptyBody} />
      </>
    );
  }

  return (
    <>
      <PageHeader title={t.programme.title} description={t.programme.lead} />
      <ProgrammeView
        sessions={sessions}
        days={days}
        stages={stages}
        applications={(applicationRows ?? []) as MyApplication[]}
        registrations={
          (registrationRows ?? []) as { session_id: string; status: string }[]
        }
        questions={(questionRows ?? []) as SessionQuestion[]}
        timezones={Object.fromEntries(timezoneByEvent)}
        labels={labels}
        locale={locale}
        t={t.programme}
        common={{ cancel: t.common.cancel, close: t.common.close, save: t.common.save }}
        rpcMessages={t.rpc}
      />
    </>
  );
}

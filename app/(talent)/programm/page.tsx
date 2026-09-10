import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vlabel } from "@/lib/vocab";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProgrammeView } from "./ProgrammeView";
import type {
  MyApplication,
  ProgrammeSession,
  QuestionOption,
  RawQuestionOption,
  SessionQuestion,
} from "./types";

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
    // Katalogfragen tragen ihren Text in `question_catalog` — mitladen, sonst
    // steht im Bewerbungsformular nur ein Strich.
    supabase
      .from("session_question")
      .select(
        "id, session_id, question_id, label_de, label_en, type, options, required, sort_order, " +
          "question_catalog(label_de, label_en, help_de, help_en, type, options)",
      )
      .order("sort_order"),
    supabase.from("event").select("id, timezone"),
    loadVocabMap(supabase, locale),
  ]);

  const sessions = (sessionRows ?? []) as ProgrammeSession[];

  type RawQuestion = {
    id: string;
    session_id: string;
    question_id: string | null;
    label_de: string | null;
    label_en: string | null;
    type: string | null;
    options: RawQuestionOption[] | null;
    required: boolean;
    question_catalog: {
      label_de: string | null;
      label_en: string | null;
      help_de: string | null;
      help_en: string | null;
      type: string | null;
      options: RawQuestionOption[] | null;
    } | null;
  };

  const pick = (own: string | null, fromCatalog: string | null | undefined) =>
    own?.trim() ? own : (fromCatalog ?? null);

  /**
   * Der Schlüssel einer Option heißt im Katalog `key`, in eigenen Fragen
   * `value`. Ohne diese Auflösung landete der Labeltext als Antwort in der
   * Datenbank. Optionen ohne Schlüssel fallen weg — sie wären nicht auswertbar.
   */
  const options = (raw: RawQuestionOption[] | null | undefined): QuestionOption[] | null => {
    if (!Array.isArray(raw)) return null;
    const list = raw
      .map((o) => ({ ...o, value: o.key ?? o.value }))
      .filter((o): o is RawQuestionOption & { value: string } => Boolean(o.value))
      .map(({ value, label_de, label_en }) => ({ value, label_de, label_en }));
    return list.length > 0 ? list : null;
  };

  const questions: SessionQuestion[] = ((questionRows ?? []) as unknown as RawQuestion[]).map(
    (q) => {
      const cat = Array.isArray(q.question_catalog) ? q.question_catalog[0] : q.question_catalog;
      const label =
        locale === "en"
          ? (pick(q.label_en, cat?.label_en) ?? pick(q.label_de, cat?.label_de))
          : (pick(q.label_de, cat?.label_de) ?? pick(q.label_en, cat?.label_en));
      const help = locale === "en" ? (cat?.help_en ?? cat?.help_de) : (cat?.help_de ?? cat?.help_en);
      return {
        key: q.question_id ?? q.id,
        session_id: q.session_id,
        label: label ?? "—",
        help: help ?? null,
        type: q.type ?? cat?.type ?? "text",
        options: options(q.options) ?? options(cat?.options),
        required: q.required,
      };
    },
  );
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
        questions={questions}
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

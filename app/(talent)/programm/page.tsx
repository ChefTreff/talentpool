import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vlabel } from "@/lib/vocab";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { ButtonLink } from "@/components/ui/Button";
import { loadStoreLinks } from "@/lib/event-app/load-store-links";
import { ProgrammeView } from "./ProgrammeView";
import { isApplicationFormat, targetProfileLabels, type FormatDetails } from "./types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  MyApplication,
  ProgrammeSession,
  QuestionOption,
  RawQuestionOption,
  SessionQuestion,
} from "./types";
import { neuesFenster } from "@/components/ui/neues-fenster";

export const dynamic = "force-dynamic";

export default async function ProgrammPage() {
  await requireArea("talent", "/programm");
  const { locale, t } = await getI18n();
  const supabase = await createSupabaseServerClient();
  // PART-072: die Store-Links pflegt das Team im Admin unter Videos → Links.
  const storeLinks = await loadStoreLinks("talent");

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

  // Format-Details (TAL-002/003). Vor der Migration v6_format_details_public
  // liefert der Aufruf einen Fehler — dann bleibt es bei den Grunddaten.
  type RawDetails = {
    session_id: string;
    host_name: string | null;
    location_text: string | null;
    image_path: string | null;
    job_title: string | null;
    job_posting_text: string | null;
    job_posting_url: string | null;
    interview_mode: "single" | "group" | null;
    target_profile: Record<string, string[]> | null;
    tour: {
      name: string;
      meeting_point: string | null;
      starts_at: string | null;
      ends_at: string | null;
      stops: {
        host_name: string | null;
        address: string | null;
        arrival_at: string | null;
        departure_at: string | null;
        notes_public: string | null;
        target_profile: Record<string, string[]> | null;
      }[];
    } | null;
  };
  const { data: detailRows } = await supabase.rpc("programme_format_details");
  const rawDetails = (detailRows ?? []) as RawDetails[];
  // Bilder liegen im privaten Bucket der Partner. Signiert werden nur Pfade,
  // die `programme_format_details()` eben herausgegeben hat; der Pfad selbst
  // geht nicht in den Browser.
  const imagePaths = rawDetails.map((d) => d.image_path).filter((p): p is string => Boolean(p));
  let imageUrls = new Map<string, string | null>();
  if (imagePaths.length > 0) {
    const { data: signed } = await createSupabaseAdminClient()
      .storage.from("partner-assets")
      .createSignedUrls(imagePaths, 60 * 60);
    imageUrls = new Map((signed ?? []).map((u) => [u.path ?? "", u.signedUrl ?? null]));
  }
  const tpLabel = (v: string, k: string) => vlabel(vocab, v, k);
  const details: Record<string, FormatDetails> = Object.fromEntries(
    rawDetails.map((d) => [
      d.session_id,
      {
        hostName: d.host_name,
        location: d.location_text ?? d.tour?.meeting_point ?? null,
        imageUrl: d.image_path ? (imageUrls.get(d.image_path) ?? null) : null,
        jobTitle: d.job_title,
        jobPostingText: d.job_posting_text,
        jobPostingUrl: d.job_posting_url,
        interviewMode: d.interview_mode,
        targetProfile: targetProfileLabels(d.target_profile, tpLabel),
        tour: d.tour
          ? {
              name: d.tour.name,
              meetingPoint: d.tour.meeting_point,
              startsAt: d.tour.starts_at,
              endsAt: d.tour.ends_at,
              stops: (d.tour.stops ?? []).map((st) => ({
                hostName: st.host_name,
                address: st.address,
                arrivalAt: st.arrival_at,
                departureAt: st.departure_at,
                notes: st.notes_public,
                targetProfile: targetProfileLabels(st.target_profile, tpLabel),
              })),
            }
          : null,
      } satisfies FormatDetails,
    ]),
  );

  // Nur Formate mit Bewerbung (TAL-014). Keynotes, Panels und Talks stehen in
  // der Event-App; das Portal ist der Bewerbungsort, nicht der Programmplan.
  const sessions = ((sessionRows ?? []) as ProgrammeSession[]).filter((s) =>
    isApplicationFormat(s.format),
  );

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
      // Eine Sprache je Session (SPK-052): „Gemischt" gibt es nicht mehr.
      ["de", "en"].map((k) => [k, vlabel(vocab, "language", k)]),
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

  // Hinweis auf das vollständige Programm — auch im Leerzustand, dort erst recht.
  const eventApp = (
    <Card className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="ct-label">{t.programme.eventAppTitle}</p>
        <p className="ct-help">{t.programme.eventAppBody}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {storeLinks.appStore && (
          <ButtonLink variant="secondary" size="sm" href={storeLinks.appStore} {...neuesFenster}>
            {t.programme.eventAppIos}
          </ButtonLink>
        )}
        {storeLinks.googlePlay && (
          <ButtonLink variant="secondary" size="sm" href={storeLinks.googlePlay} {...neuesFenster}>
            {t.programme.eventAppAndroid}
          </ButtonLink>
        )}
      </div>
    </Card>
  );

  if (sessions.length === 0) {
    return (
      <>
        <PageHeader word={t.talentStart.cardProgrammeWord} title={t.programme.title} description={t.programme.lead} />
        {eventApp}
        <EmptyState title={t.programme.emptyTitle} description={t.programme.emptyBody} />
      </>
    );
  }

  return (
    <>
      <PageHeader word={t.talentStart.cardProgrammeWord} title={t.programme.title} description={t.programme.lead} />
      {eventApp}
      <ProgrammeView
        sessions={sessions}
        days={days}
        stages={stages}
        applications={(applicationRows ?? []) as MyApplication[]}
        registrations={
          (registrationRows ?? []) as { session_id: string; status: string }[]
        }
        questions={questions}
        details={details}
        timezones={Object.fromEntries(timezoneByEvent)}
        labels={labels}
        locale={locale}
        t={t.programme}
        common={{
          cancel: t.common.cancel,
          close: t.common.close,
          save: t.common.save,
          until: t.common.until,
        }}
        rpcMessages={t.rpc}
      />
    </>
  );
}

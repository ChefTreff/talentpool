import Image from "next/image";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { AbschnittsNavigation } from "@/components/ui/Abschnitte";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionTabs } from "@/components/layout/SectionTabs";
import { sessionReiter, waehleSession } from "./auswahl";
import { SessionView } from "./SessionView";
import type { SpeakerProfile } from "../types";
import type { MySession, PresentationWindow, SpeakerAsset } from "./types";
import { neuesFenster } from "@/components/ui/neues-fenster";

export const dynamic = "force-dynamic";
// SPK-023: nach dem Upload spiegelt `after()` die Präsentation nach Drive —
// Server-Aktionen übernehmen die Laufzeitgrenze der Seite.
export const maxDuration = 300;

/** Eine Zeile aus `edition_files` — hier interessiert nur der Hallenplan. */
type EditionFile = {
  kind: string;
  storage_path: string;
  filename: string;
  mime: string | null;
  label_de: string | null;
  label_en: string | null;
  preview_path: string | null;
  preview_width: number | null;
  preview_height: number | null;
};

/**
 * Die Session-Seite des Speakers. **Hat jemand zwei Sessions** (SPK-085, Konrad 05.10.: „der gesamte Session-Bereich läuft über eine Session-Auswahl — sonst
 * doppelte Infos auf einer Seite“), wählen Reiter oben die Session (`?session=<Kennung>`, `waehleSession`), und darunter steht der ganze Bereich — Slot, Inhalt,
 * Präsentation, Technik — **einmal**, für die gewählte. Die Anker (`#slot` …) sind damit auch eindeutig. Mit einer Session gibt es keine Reiter.
 */
export default async function SpeakerSessionPage({ searchParams }: { searchParams: Promise<{ session?: string | string[] }> }) {
  await requireArea("speaker", "/speaker/session");
  const { session: sessionParam } = await searchParams;
  const { locale, t } = await getI18n("en");
  const supabase = await createSupabaseServerClient();

  const [{ data: profileJson }, { data: sessionRows }, vocab] = await Promise.all([
    supabase.rpc("my_speaker_profile"),
    supabase.rpc("my_sessions"),
    loadVocabMap(supabase, locale),
  ]);

  const profile = (profileJson ?? null) as SpeakerProfile | null;
  const sessions = (sessionRows ?? []) as MySession[];

  if (!profile) {
    return (
      <>
        <PageHeader word={t.speaker.wordStage} title={t.speaker.sessionTitle} description={t.speaker.sessionLead} />
        <EmptyState title={t.speaker.noProfileTitle} description={t.speaker.noProfileBody} />
      </>
    );
  }

  // SPK-085: gezeigt wird die gewählte Session; mit einer Session ist es diese.
  const gewaehltId = waehleSession(sessionParam, sessions);
  const angezeigt = sessions.filter((s) => s.session_id === gewaehltId);

  // Dateien und Fristen je Session: die Frist hängt am Slot, nicht am Profil.
  const [{ data: assetRows }, ...windows] = await Promise.all([
    supabase.rpc("my_speaker_assets", { p_profile_id: profile.id }),
    ...angezeigt.map((s) => supabase.rpc("presentation_window", { p_session_id: s.session_id })),
  ]);

  const windowBySession: Record<string, PresentationWindow | null> = {};
  angezeigt.forEach((s, i) => {
    windowBySession[s.session_id] = (windows[i]?.data ?? null) as PresentationWindow | null;
  });

  // Hallenplan (SPK-002). Er hängt an der Edition, nicht am Slot, und steht
  // deshalb auch ohne Session da: „wo ist meine Bühne" ist die Frage, die man
  // vor allen anderen hat. Der Bucket ist privat, die Adresse wird signiert.
  const { data: fileRows } = await supabase.rpc("edition_files", {
    p_audience: "speaker",
    p_edition_id: profile.edition_id,
  });
  const plan = ((fileRows ?? []) as EditionFile[]).find((f) => f.kind === "hallenplan") ?? null;
  const planUrl = plan
    ? (await supabase.storage.from("edition-files").createSignedUrl(plan.storage_path, 3600)).data
        ?.signedUrl ?? null
    : null;
  // ADM-042: anzeigen die Vorschau, öffnen das Original.
  const bildUrl = plan?.preview_path
    ? (await supabase.storage.from("edition-files").createSignedUrl(plan.preview_path, 3600)).data
        ?.signedUrl ?? planUrl
    : planUrl;

  return (
    <div className="max-w-detail">
      <PageHeader word={t.speaker.wordStage} title={t.speaker.sessionTitle} description={t.speaker.sessionLead} />

      {/* SPK-085: zwei oder mehr Sessions → die Auswahl steht **vor** den Abschnitten, denn sie gelten für die gewählte. Reiter über die Adresszeile
          (`?session=`), die Seite bleibt beim Wechsel, wo sie ist (`scroll: false`); eine Session hat keine Auswahl. */}
      {sessions.length > 1 && (
        <>
          <p className="ct-help mb-3 max-w-text">{t.speaker.sessionChooseHint.replace("{n}", String(sessions.length))}</p>
          <SectionTabs
            label={t.speaker.sessionChoose}
            items={sessionReiter(sessions, {
              formate: vgroup(vocab, "session_format"),
              nummer: (n) => t.speaker.sessionNumber.replace("{n}", String(n)),
              dateLocale: t.meta.dateLocale,
            }).map((r) => ({ href: `?session=${r.id}`, label: r.label, aktiv: r.id === gewaehltId, scroll: false }))}
          />
        </>
      )}

      {/* Die Abschnitte der längsten Seite im Portal (SPK-043, Muster QS-026).
          Nur was auch da ist: ohne Session gibt es keine Anker. */}
      {sessions.length > 0 && (
        <AbschnittsNavigation
          label={t.speaker.sectionsLabel}
          items={[
            { id: "slot", label: t.speaker.sectionSlot },
            { id: "inhalt", label: t.speaker.sectionContent },
            { id: "praesentation", label: t.speaker.presentationTitle },
            { id: "technik", label: t.speaker.techTitle },
            ...(plan ? [{ id: "hallenplan", label: t.speaker.planTitle }] : []),
          ]}
        />
      )}
      {sessions.length === 0 ? (
        <EmptyState
          title={t.speaker.noSessionTitle}
          description={t.speaker.noSessionBody}
        />
      ) : (
        <SessionView
          profileId={profile.id}
          editionId={profile.edition_id}
          isAssistant={profile.is_assistant}
          slidesConsent={profile.consents?.slides_publication === true}
          sessions={angezeigt}
          assets={(assetRows ?? []) as SpeakerAsset[]}
          windows={windowBySession}
          labels={{
            format: vgroup(vocab, "session_format"),
            language: vgroup(vocab, "language"),
            accessMode: vgroup(vocab, "access_mode"),
            publishStatus: vgroup(vocab, "publish_status"),
            topics: vgroup(vocab, "session_topic"),
            speaker_microphone: vgroup(vocab, "speaker_microphone"),
          }}
          locale={locale}
          dateLocale={t.meta.dateLocale}
          t={t.speaker}
          assistant={t.titleAssistant}
          common={{
            cancel: t.common.cancel,
            choose: t.common.choose,
            none: t.common.none,
            required: t.common.required,
            save: t.common.save,
            deadlinePassed: t.common.deadlinePassed,
            deadlineDone: t.common.deadlineDone,
            unsaved: t.common.unsaved,
          }}
          rpcMessages={t.rpc}
        />
      )}

      <section aria-labelledby="hallenplan" className="mt-8 scroll-mt-20">
        <h2 id="hallenplan" className="ct-h2 mb-3 text-ink">
          {t.speaker.planTitle}
        </h2>
        <Card>
          <p className="ct-help">{t.speaker.planBody}</p>
          {plan && planUrl ? (
            <>
              {plan.mime?.startsWith("image/") && (
                // `unoptimized`: die Adresse ist signiert und läuft ab. Durch den
                // Bildoptimierer gereicht, würde sie zwischengespeichert und wäre
                // nach Ablauf tot (dieselbe Regel wie im Partner-Portal).
                <Image
                  src={bildUrl ?? planUrl}
                  alt={(locale === "en" ? plan.label_en : plan.label_de) ?? plan.filename}
                  width={plan.preview_width ?? 1600}
                  height={plan.preview_height ?? 1000}
                  unoptimized
                  className="mt-3 h-auto w-full rounded-ct-sm border"
                />
              )}
              <div className="mt-3">
                <ButtonLink
                  href={planUrl}
                  {...neuesFenster}
                  variant="secondary"
                >
                  {t.speaker.planOpen}
                </ButtonLink>
              </div>
            </>
          ) : (
            <p className="ct-help mt-3 text-muted">{t.speaker.planNone}</p>
          )}
        </Card>
      </section>
    </div>
  );
}

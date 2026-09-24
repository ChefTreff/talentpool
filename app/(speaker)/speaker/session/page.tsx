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
import { SessionView } from "./SessionView";
import type { SpeakerProfile } from "../types";
import type { MySession, PresentationWindow, SpeakerAsset } from "./types";
import { neuesFenster } from "@/components/ui/neues-fenster";

export const dynamic = "force-dynamic";

/** Eine Zeile aus `edition_files` — hier interessiert nur der Hallenplan. */
type EditionFile = {
  kind: string;
  storage_path: string;
  filename: string;
  mime: string | null;
  label_de: string | null;
  label_en: string | null;
};

export default async function SpeakerSessionPage() {
  await requireArea("speaker", "/speaker/session");
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

  // Dateien und Fristen je Session: die Frist hängt am Slot, nicht am Profil.
  const [{ data: assetRows }, ...windows] = await Promise.all([
    supabase.rpc("my_speaker_assets", { p_profile_id: profile.id }),
    ...sessions.map((s) => supabase.rpc("presentation_window", { p_session_id: s.session_id })),
  ]);

  const windowBySession: Record<string, PresentationWindow | null> = {};
  sessions.forEach((s, i) => {
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

  return (
    <div className="max-w-detail">
      <PageHeader word={t.speaker.wordStage} title={t.speaker.sessionTitle} description={t.speaker.sessionLead} />

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
          sessions={sessions}
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
                  src={planUrl}
                  alt={(locale === "en" ? plan.label_en : plan.label_de) ?? plan.filename}
                  width={1600}
                  height={1000}
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

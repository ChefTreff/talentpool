import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { SessionView } from "./SessionView";
import type { SpeakerProfile } from "../types";
import type { MySession, PresentationWindow, SpeakerAsset } from "./types";

export const dynamic = "force-dynamic";

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
        <PageHeader title={t.speaker.sessionTitle} description={t.speaker.sessionLead} />
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

  return (
    <div className="max-w-[900px]">
      <PageHeader title={t.speaker.sessionTitle} description={t.speaker.sessionLead} />
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
          }}
          locale={locale}
          dateLocale={t.meta.dateLocale}
          t={t.speaker}
          common={{
            cancel: t.common.cancel,
            choose: t.common.choose,
            none: t.common.none,
            required: t.common.required,
            save: t.common.save,
          }}
          rpcMessages={t.rpc}
        />
      )}
    </div>
  );
}

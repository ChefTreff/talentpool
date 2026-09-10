import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { TicketsView } from "./TicketsView";
import type { SpeakerProfile } from "../types";
import type { SpeakerTickets } from "./types";

export const dynamic = "force-dynamic";

export default async function SpeakerTicketsPage() {
  await requireArea("speaker", "/speaker/tickets");
  const { locale, t } = await getI18n("en");
  const supabase = await createSupabaseServerClient();

  const [{ data: profileJson }, { data: ticketsJson }, vocab] = await Promise.all([
    supabase.rpc("my_speaker_profile"),
    supabase.rpc("my_speaker_tickets"),
    loadVocabMap(supabase, locale),
  ]);

  const profile = (profileJson ?? null) as SpeakerProfile | null;
  const tickets = (ticketsJson ?? null) as SpeakerTickets | null;

  if (!profile || !tickets) {
    return (
      <>
        <PageHeader title={t.speaker.ticketsTitle} description={t.speaker.ticketsLead} />
        <EmptyState title={t.speaker.noProfileTitle} description={t.speaker.noProfileBody} />
      </>
    );
  }

  return (
    <div className="max-w-[800px]">
      <PageHeader title={t.speaker.ticketsTitle} description={t.speaker.ticketsLead} />
      <TicketsView
        profileId={profile.id}
        isAssistant={profile.is_assistant}
        tickets={tickets}
        passTypes={vgroup(vocab, "ticket_type")}
        pipelineLabels={vgroup(vocab, "speaker_pipeline")}
        dateLocale={t.meta.dateLocale}
        t={t.speaker}
        common={{ cancel: t.common.cancel, none: t.common.none, save: t.common.save }}
        rpcMessages={t.rpc}
      />
    </div>
  );
}

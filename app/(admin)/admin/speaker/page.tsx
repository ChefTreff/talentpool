import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { PageHeader } from "@/components/ui/PageHeader";
import { SpeakerListe } from "./SpeakerListe";
import type { AdminSpeakerRow } from "./types";

export const dynamic = "force-dynamic";

/**
 * Die vollständige Speaker-Liste. Dieselbe RPC wie im Lead-Portal — wer welche
 * Zeilen sieht, entscheidet `can_manage_speaker()`, und für die
 * Programmleitung schliesst das jeden ein.
 */
export default async function AdminSpeakerPage() {
  await requireArea("admin", "/admin/speaker");
  const { locale, t } = await getI18n("de");
  const supabase = await createSupabaseServerClient();

  const [{ data: rows }, vocab] = await Promise.all([
    supabase.rpc("manager_speakers"),
    loadVocabMap(supabase, locale),
  ]);

  const speakers = (rows ?? []) as AdminSpeakerRow[];

  return (
    <>
      <PageHeader
        title={t.adminSpeaker.title}
        description={`${t.adminSpeaker.lead} · ${speakers.length} ${t.common.shown}`}
      />
      <SpeakerListe
        rows={speakers}
        labels={{
          pipeline: vgroup(vocab, "speaker_pipeline"),
          speakerType: vgroup(vocab, "speaker_type"),
          declineReason: vgroup(vocab, "speaker_decline_reason"),
        }}
        dateLocale={t.meta.dateLocale}
        t={t.adminSpeaker}
      />
    </>
  );
}

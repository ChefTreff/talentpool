import { notFound } from "next/navigation";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PipelineView } from "./PipelineView";
import type { ManagedSpeaker, ManagerScope } from "./types";

export const dynamic = "force-dynamic";

export default async function SpeakerLeadsPage() {
  const ctx = await requireArea("speaker-leads", "/speaker-leads");
  // Lead-Portal ist Deutsch zuerst (Arbeitsauftrag Welle 2, Abschnitt C) —
  // dieselbe Mechanik wie „Englisch zuerst" im Speaker-Portal, nur andersherum.
  const { locale, t } = await getI18n("de");
  const supabase = await createSupabaseServerClient();

  const { data: scopeJson } = await supabase.rpc("my_manager_scope");
  const scope = (scopeJson ?? null) as ManagerScope | null;

  // `requireArea` prüft die Rolle, `my_manager_scope` den tatsächlichen Scope.
  // Wer keiner ist, soll den Bereich auch nicht als leere Seite sehen.
  if (!scope?.is_manager) notFound();

  const [{ data: speakerRows }, vocab] = await Promise.all([
    supabase.rpc("manager_speakers"),
    loadVocabMap(supabase, locale),
  ]);

  const speakers = (speakerRows ?? []) as ManagedSpeaker[];

  return (
    <>
      <PageHeader
        title={t.leads.title}
        description={`${t.leads.lead} · ${speakers.length} ${t.common.shown}`}
      />
      {speakers.length === 0 && scope.editions.length === 0 && !scope.all ? (
        <EmptyState title={t.leads.emptyScopeTitle} description={t.leads.emptyScopeBody} />
      ) : (
        <PipelineView
          scope={scope}
          speakers={speakers}
          isStaff={ctx.isStaff}
          labels={{
            pipeline: vgroup(vocab, "speaker_pipeline"),
            speakerType: vgroup(vocab, "speaker_type"),
            hospitality: vgroup(vocab, "hospitality_status"),
            hotelTier: vgroup(vocab, "hotel_tier"),
            passType: vgroup(vocab, "ticket_type"),
          }}
          locale={locale}
          dateLocale={t.meta.dateLocale}
          t={t.leads}
          common={{
            cancel: t.common.cancel,
            choose: t.common.choose,
            close: t.common.close,
            none: t.common.none,
            required: t.common.required,
            save: t.common.save,
          }}
          rpcMessages={t.rpc}
        />
      )}
    </>
  );
}

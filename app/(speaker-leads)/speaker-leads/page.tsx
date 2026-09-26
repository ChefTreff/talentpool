import { notFound } from "next/navigation";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { heute } from "@/lib/speaker/verlauf";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import type { ManagedSpeaker, ManagerScope } from "./types";
import { uebersicht } from "./uebersicht";
import { UebersichtAnsicht } from "./UebersichtAnsicht";

export const dynamic = "force-dynamic";

const PATH = "/speaker-leads";

/**
 * Übersicht des Stage-Lead-Portals (LEAD-024, Konrad 24.09.: „wie die anderen
 * Portale“ — Hero-Band, Kurzüberblick, Checkliste, offene To-dos). Die Zahlen
 * kommen aus denselben Daten wie Pipeline und Bestätigte (`uebersicht.ts`),
 * deshalb keine eigene Abfrage und nichts, was abweicht. Die Darstellung steht
 * in `UebersichtAnsicht.tsx`.
 */
export default async function SpeakerLeadsUebersicht() {
  const { firstName } = await requireArea("speaker-leads", PATH);
  const { t } = await getI18n("de");
  const supabase = await createSupabaseServerClient();

  const { data: scopeJson } = await supabase.rpc("my_manager_scope");
  const scope = (scopeJson ?? null) as ManagerScope | null;
  // Wie in der Pipeline: wer keinen Scope hat, sieht den Bereich nicht als leere Seite.
  if (!scope?.is_manager) notFound();

  const { data: speakerRows } = await supabase.rpc("manager_speakers");
  const speakers = (speakerRows ?? []) as ManagedSpeaker[];

  if (speakers.length === 0 && scope.editions.length === 0 && !scope.all) {
    // Leerzustand behält den schlichten Kopf (QS-035).
    return (
      <>
        <PageHeader word={t.leads.wordLineup} title={t.areas["speaker-leads"].portal} description={t.leads.overviewLead} />
        <EmptyState title={t.leads.emptyScopeTitle} description={t.leads.emptyScopeBody} />
      </>
    );
  }

  return (
    <UebersichtAnsicht
      t={t}
      vorname={firstName?.trim() || null}
      buehnen={scope.stages.map((st) => st.name).filter((n): n is string => Boolean(n))}
      u={uebersicht(speakers, scope, heute())}
    />
  );
}

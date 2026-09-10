import Link from "next/link";
import { notFound } from "next/navigation";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { PageHeader } from "@/components/ui/PageHeader";
import { QueueView } from "./QueueView";
import type { OverviewRow, QueueRow } from "../types";

export const dynamic = "force-dynamic";

type CatalogRow = {
  question_id: string | null;
  id: string;
  label_de: string | null;
  label_en: string | null;
  sort_order: number | null;
  question_catalog: { label_de: string | null; label_en: string | null } | null;
};

/**
 * Queue einer Session. Auch die Kopfzeile kommt aus `applications_overview()`:
 * Wer entscheiden darf, ist nicht zwingend Programm-Leser und könnte die
 * `session`-Zeile gar nicht lesen. Eine unbekannte ID ist deshalb schlicht 404.
 */
export default async function QueuePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireArea("admin", `/admin/bewerbungen/${id}`);
  const { locale, t } = await getI18n();
  const supabase = await createSupabaseServerClient();

  const [{ data: overview }, { data: queue, error }, { data: events }, { data: questionRows }, vocab] =
    await Promise.all([
      supabase.rpc("applications_overview"),
      supabase.rpc("applications_for_session", { p_session_id: id }),
      supabase.from("event").select("id, timezone"),
      supabase
        .from("session_question")
        .select("id, question_id, label_de, label_en, sort_order, question_catalog(label_de, label_en)")
        .eq("session_id", id)
        .order("sort_order"),
      loadVocabMap(supabase, locale),
    ]);

  const session = ((overview ?? []) as OverviewRow[]).find((s) => s.session_id === id);
  if (!session || error) notFound();

  // Antworten sind auf `question_id` geschlüsselt; der Text steht bei
  // Katalogfragen im Katalog (wie in der Programm-Ansicht).
  const questionLabels: Record<string, string> = {};
  for (const q of (questionRows ?? []) as unknown as CatalogRow[]) {
    const cat = Array.isArray(q.question_catalog) ? q.question_catalog[0] : q.question_catalog;
    const own = locale === "en" ? q.label_en : q.label_de;
    const fromCatalog = locale === "en" ? cat?.label_en : cat?.label_de;
    questionLabels[q.question_id ?? q.id] =
      (own?.trim() ? own : null) ?? fromCatalog ?? q.label_de ?? cat?.label_de ?? "—";
  }

  const title = (locale === "en" ? session.title_en : session.title_de) ?? session.title_de ?? "—";
  const statusLabels = vgroup(vocab, "application_status");
  // Feldnamen aus den vorhandenen Wörterbüchern, nicht neu erfunden.
  const profileLabels: Record<string, string> = {
    occupation_status: t.profile.fields.occupationStatus,
    career_level: t.profile.fields.careerLevel,
    employer_name: t.profile.fields.employerName,
    university: t.profile.fields.university,
    study_field: t.profile.fields.studyField,
    city: t.onboarding.city,
    linkedin_url: t.profile.fields.linkedin,
  };

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/admin/bewerbungen" className="ct-link">
            {t.admin.applications.title}
          </Link>
        }
        title={title}
        description={session.stage_name ?? undefined}
      />
      <QueueView
        session={session}
        rows={(queue ?? []) as QueueRow[]}
        timezone={
          ((events ?? []) as { id: string; timezone: string }[]).find(
            (e) => e.id === session.event_id,
          )?.timezone ?? "Europe/Berlin"
        }
        questionLabels={questionLabels}
        statusLabels={statusLabels}
        profileLabels={profileLabels}
        vocabProfile={{
          occupation_status: vgroup(vocab, "occupation_status"),
          career_level: vgroup(vocab, "career_level"),
          study_field: vgroup(vocab, "study_field"),
        }}
        dateLocale={t.meta.dateLocale}
        t={t.admin.applications}
        common={{ cancel: t.common.cancel, none: t.common.none, save: t.common.save }}
        rpcMessages={t.rpc}
      />
    </>
  );
}

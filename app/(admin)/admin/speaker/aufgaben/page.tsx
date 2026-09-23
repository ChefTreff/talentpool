import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { AufgabenListe, type TaskRow } from "./AufgabenListe";

export const dynamic = "force-dynamic";

/**
 * Die Aufgaben, die der Speaker selbst abhakt (SPK-024, Migration 0149).
 *
 * Konrad, 23.09.: „Es wird auch Punkte geben, die sie selbst abhaken können
 * müssen." Gemeint sind Erledigungen, die das Portal nicht beobachten kann —
 * „Beim Hotel gemeldet", „Vertrag zurückgeschickt". Was das Portal selbst
 * sieht (Foto, Einwilligung, Folien), steht weiter in der abgeleiteten
 * Checkliste und gehört nicht hierher.
 */
export default async function AdminSpeakerTasksPage() {
  await requireArea("admin", "/admin/speaker/aufgaben");
  const { locale, t } = await getI18n();
  const supabase = await createSupabaseServerClient();

  const { data: events } = await supabase
    .from("event")
    .select("id, name, slug")
    .eq("is_edition", true)
    .order("slug");
  const editionen = ((events ?? []) as { id: string; name: string | null; slug: string }[]).map(
    (e) => ({ id: e.id, name: e.name ?? e.slug }),
  );
  const aktuell = editionen[0]?.id;

  // Ohne Edition gibt es nichts zu pflegen — und `speaker_tasks_admin` bekäme
  // eine leere Kennung.
  const { data: rows } = aktuell
    ? await supabase.rpc("speaker_tasks_admin", { p_edition_id: aktuell })
    : { data: [] };

  // Die Fristen derselben Edition zur Auswahl: die Aufgabe verweist auf einen
  // Schlüssel, gepflegt wird die Frist unter „Fristen".
  const { data: fristen } = aktuell
    ? await supabase
        .from("deadline")
        .select("key, label_de, label_en")
        .eq("edition_id", aktuell)
        .in("audience", ["all", "speaker"])
    : { data: [] };

  return (
    <>
      <PageHeader title={t.adminSpeakerTasks.title} description={t.adminSpeakerTasks.lead} />
      {editionen.length === 0 ? (
        <EmptyState
          title={t.adminSpeakerTasks.emptyTitle}
          description={t.adminSpeakerTasks.emptyBody}
        />
      ) : (
        <AufgabenListe
          tasks={(rows ?? []) as TaskRow[]}
          editionen={editionen}
          fristen={
            ((fristen ?? []) as { key: string; label_de: string; label_en: string }[]).map((f) => ({
              key: f.key,
              label: (locale === "en" ? f.label_en : f.label_de) || f.key,
            }))
          }
          t={t.adminSpeakerTasks}
          common={{ cancel: t.common.cancel, none: t.common.none, save: t.common.save }}
          rpcMessages={t.rpc}
        />
      )}
    </>
  );
}

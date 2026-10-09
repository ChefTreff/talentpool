import { notFound } from "next/navigation";
import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { boardEvents } from "@/components/programme/events";
import { GeruestView } from "./GeruestView";
import { geruestEventId } from "./felder";
import type { Sperrzeit } from "@/components/programme/buehnen";
import type { Geruest } from "./types";

export const dynamic = "force-dynamic";

/**
 * Das Grundgerüst der Edition.
 *
 * `programme_skeleton()` prüft `is_programme_editor()` selbst — wer den
 * Admin-Bereich über eine andere Rolle betritt, bekommt hier nichts. Das Gate
 * der Seite ist also nicht die einzige Grenze, sondern die äussere.
 *
 * **Welche Veranstaltung?** (ADM-107) Ohne Argument liefert `programme_skeleton()` die Edition
 * selbst — die hat Tage, aber keine Bühnen: Bühnen, Sperrzeiten und Slots hängen am **Summit**
 * (Kind-Event der Edition, LEAD-014), und genau den zeigt auch das Board. Die Seite fragt deshalb
 * erst die Edition und lädt dann das Gerüst des Summit (`boardEvents`, dieselbe Wahl wie im Board);
 * gibt es keinen, bleibt es bei der Edition.
 */
export default async function AdminEditionPage() {
  await requireAdminSection("edition", "/admin/edition");
  const { t } = await getI18n("de");
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("programme_skeleton");
  if (error || !data) notFound();
  let geruest = data as Geruest;
  const summits = await boardEvents(supabase, geruest.event ? [geruest.event.id] : undefined);
  const summitId = geruestEventId(geruest.event?.id ?? null, summits);
  if (summitId) {
    const { data: summitData } = await supabase.rpc("programme_skeleton", { p_event_id: summitId });
    if (summitData) geruest = summitData as Geruest;
  }
  // ADM-085/LEAD-062: die Sperrzeiten des Events. Eine Zugabe — fehlt die Funktion oder das Recht, steht die Karte leer.
  const { data: sperrRows } = geruest.event
    ? await supabase.rpc("stage_blocked_times", { p_event_id: geruest.event.id })
    : { data: [] };

  const zeitraum = [geruest.event?.start_date, geruest.event?.end_date]
    .filter(Boolean)
    .join(" – ");

  return (
    <>
      <PageHeader
        word={t.admin.words.edition}
        title={t.adminEdition.title}
        description={[geruest.event?.name, zeitraum, geruest.event?.venue]
          .filter(Boolean)
          .join(" · ")}
      />
      <GeruestView
        geruest={geruest}
        sperrzeiten={(sperrRows ?? []) as Sperrzeit[]}
        dateLocale={t.meta.dateLocale}
        t={t.adminEdition}
        common={{
          cancel: t.common.cancel,
          choose: t.common.choose,
          none: t.common.none,
          save: t.common.save,
        }}
        rpcMessages={t.rpc}
      />
    </>
  );
}

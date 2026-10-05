import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { PIPELINE_BESTAETIGT } from "@/app/(speaker-leads)/speaker-leads/types";
import { SideEventsAdmin } from "./SideEventsAdmin";
import { PLATZHALTER_FRIST, type SideEventRow, type SpeakerAuswahl } from "./types";

export const dynamic = "force-dynamic";

type SpeakerZeile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  organization_name: string | null;
  pipeline_status: string;
  stage_guest: boolean | null;
};

/**
 * Die Side Events verwalten (ADM-077, SPK-091): aus der Speaker Reception wurde eine Einladungsliste.
 *
 * Hier entstehen Zeit, Ort, Beschreibung und Obergrenze, und hier wird eingeladen — die Einladung kommt als Mail mit One-Click-Link und
 * steht im Speaker-Portal. Wer zu- oder abgesagt hat, trägt das Team auch von Hand ein (mündliche Zusage). Eingeladen werden nur bestätigte
 * Speaker ohne Partner-Gast; die Datenbank prüft das noch einmal.
 *
 * Die Liste der einladbaren Speaker kommt aus `manager_speakers` (dieselbe RPC wie die Speaker-Liste) und geht **nur mit Name und
 * Organisation** an die Oberfläche — keine Notizen, keine Adressen.
 */
export default async function AdminSideEventsPage() {
  await requireAdminSection("sideEvents", "/admin/side-events");
  const { t } = await getI18n();
  const supabase = await createSupabaseServerClient();

  const { data: edition } = await supabase
    .from("event")
    .select("id")
    .eq("is_edition", true)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const editionId = (edition as { id: string } | null)?.id ?? null;
  const arg = editionId ? { p_edition_id: editionId } : {};

  const [{ data }, { data: speakerRows }, { data: frist }] = await Promise.all([
    supabase.rpc("side_events_admin", arg),
    supabase.rpc("manager_speakers", arg),
    editionId
      ? supabase.from("deadline").select("due_at").eq("edition_id", editionId).eq("key", PLATZHALTER_FRIST).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const speakers: SpeakerAuswahl[] = ((speakerRows ?? []) as SpeakerZeile[])
    .filter((s) => PIPELINE_BESTAETIGT.includes(s.pipeline_status) && !s.stage_guest && (s.first_name || s.last_name))
    .map((s) => ({
      id: s.id,
      label: [[s.first_name, s.last_name].filter(Boolean).join(" "), s.organization_name].filter(Boolean).join(" · "),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "de"));

  return (
    <>
      <PageHeader word={t.admin.words.sideEvents} title={t.admin.sideEvents.title} description={t.admin.sideEvents.lead} />
      <SideEventsAdmin
        rows={(data ?? []) as SideEventRow[]}
        speakers={speakers}
        placeholderDue={(frist as { due_at: string } | null)?.due_at ?? null}
        dateLocale={t.meta.dateLocale}
        t={t.admin.sideEvents}
        common={{ cancel: t.common.cancel, save: t.common.save, required: t.common.required, close: t.common.close, loading: t.common.loading }}
        rpcMessages={t.rpc}
        pickerTexts={{ remove: t.admin.sideEvents.inviteRemove, noHits: t.admin.sideEvents.inviteNoHits }}
      />
    </>
  );
}

import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import type { ShuttleAdminRow } from "@/components/shuttle/types";
import { LeadShuttle } from "./LeadShuttle";

export const dynamic = "force-dynamic";

/**
 * Shuttle-Fahrten der betreuten Speaker (LEAD-011).
 *
 * Die Einschränkung macht die Datenbank: `manager_shuttle_bookings` liefert nur
 * Fahrten von Speakern, für die `can_manage_speaker` wahr ist. Diese Seite
 * filtert nichts nach — sie stellt dar.
 */
export default async function LeadsShuttlePage() {
  await requireArea("speaker-leads", "/speaker-leads/shuttle");
  const { t } = await getI18n("de");
  const supabase = await createSupabaseServerClient();

  const [{ data: rows }, { data: speakerRows }] = await Promise.all([
    supabase.rpc("manager_shuttle_bookings"),
    supabase.rpc("manager_speakers"),
  ]);

  // Für wen darf ich anfordern? Absagen bleiben draußen — für jemanden, der
  // nicht kommt, bucht niemand ein Auto. Gäste der Partner auch (SPK-070): sie
  // bekommen keine Leistungen eines Speakers (0188).
  const speakers = ((speakerRows ?? []) as {
    profile_id?: string;
    id?: string;
    first_name: string | null;
    last_name: string | null;
    pipeline_status?: string | null;
    stage_guest?: boolean;
  }[])
    .filter((s) => s.pipeline_status !== "declined" && !s.stage_guest)
    .map((s) => ({
      profile_id: s.profile_id ?? s.id ?? "",
      first_name: s.first_name,
      last_name: s.last_name,
    }))
    .filter((s) => s.profile_id !== "");

  return (
    <>
      <PageHeader word={t.leads.wordTransfer} title={t.leads.shuttleTitle} description={t.leads.shuttleLead} />
      <LeadShuttle
        rows={(rows ?? []) as ShuttleAdminRow[]}
        speakers={speakers}
        dateLocale={t.meta.dateLocale}
        t={t.leads}
        common={{ cancel: t.common.cancel, choose: t.common.choose }}
        rpcMessages={t.rpc}
      />
    </>
  );
}

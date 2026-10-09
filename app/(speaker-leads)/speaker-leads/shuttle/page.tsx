import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import type { ShuttleAdminRow } from "@/components/shuttle/types";
import { ladeShuttleSperre } from "@/lib/speaker/shuttle-sperre-server";
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

  // LEAD-065 (K-64): ab Beginn der Shuttle-Periode gehen neue Fahrten und Änderungen nicht mehr über das Portal — für das Speaker-Team gilt das
  // nicht (`locked` ist für den Aufrufer berechnet). Die Frist ist die der Edition; zum Lesen genügt ein Profil, für das man anfordern darf.
  // Der Kontakt bleibt hier weg: er ist je Speaker zugeordnet, und diese Seite gilt für alle betreuten — sie nennt das Speaker-Team.
  const stand = speakers[0] ? await ladeShuttleSperre(supabase, speakers[0].profile_id) : null;
  const sperre = stand ? { ...stand, contact_name: null, contact_phone: null, contact_email: null } : null;

  return (
    <>
      <PageHeader word={t.leads.wordTransfer} title={t.leads.shuttleTitle} description={t.leads.shuttleLead} />
      <LeadShuttle
        rows={(rows ?? []) as ShuttleAdminRow[]}
        sperre={sperre}
        speakers={speakers}
        dateLocale={t.meta.dateLocale}
        t={t.leads}
        common={{ cancel: t.common.cancel, choose: t.common.choose }}
        rpcMessages={t.rpc}
      />
    </>
  );
}

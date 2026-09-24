import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDay, formatMinutes, minutesOfDay } from "@/lib/tz";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableTabs } from "@/components/programme/TableTabs";
import { loadProgrammeTable } from "@/components/programme/loadTable";
import { canPublishSessions } from "@/components/programme/permissions";
import {
  FreigabeListe,
  type BuehnenFreigabe,
  type PartnerFreigabe,
} from "@/components/programme/FreigabeListe";

export const dynamic = "force-dynamic";

const BASE = "/admin/programm";

/**
 * Freigabe durch die Programmleitung (LEAD-022).
 *
 * Zwei Listen auf einer Seite, weil es für Paulina **eine** Frage ist: was ist
 * eingetragen, aber noch nicht draussen? Standbühnen stehen in `review`
 * (`partner_create_session` legt sie so an), Hauptbühnen sind alles, was einen
 * Slot hat und noch nicht veröffentlicht ist.
 *
 * Die Hauptbühnen sind bewusst **alle** noch offenen, nicht nur die mit
 * Stage-Lead: welche Bühne einen Lead hat, steht in `role_assignment`, und das
 * liest das Team nicht. Für die Programmleitung ist die weitere Liste ohnehin
 * die richtige — sie gibt frei, egal wer den Slot gefüllt hat.
 */
export default async function ProgrammeReleasePage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string }>;
}) {
  const { roleNames } = await requireAdminSection("programme", `${BASE}/freigabe`);
  const { t } = await getI18n();
  const { event } = await searchParams;
  const data = await loadProgrammeTable({ eventSlug: event });

  if (!data.currentEvent) {
    return (
      <>
        <PageHeader word={t.admin.words.programme} title={t.admin.programme.title} description={t.admin.programme.lead} />
        <TableTabs basePath={BASE} withRelease />
        <EmptyState title={t.admin.programme.noEventTitle} description={t.admin.programme.noEventBody} />
      </>
    );
  }

  const ev = data.currentEvent;
  const dateLocale = t.meta.dateLocale;
  const zeit = (start: string, end: string, day: string) =>
    `${formatDay(day, dateLocale)} · ${formatMinutes(minutesOfDay(start, ev.timezone))}–${formatMinutes(
      minutesOfDay(end, ev.timezone),
    )}`;

  // Standbühnen: was Partner eingetragen haben und auf die Freigabe wartet.
  const supabase = await createSupabaseServerClient();
  const { data: pending } = await supabase.rpc("partner_sessions_pending", { p_edition_id: ev.id });
  const partnerSlots = new Map(data.rows.filter((r) => r.session_id).map((r) => [r.session_id as string, r]));
  const partner: PartnerFreigabe[] = (
    (pending ?? []) as { session_id: string; org_name: string | null; format: string | null; title_de: string | null; stage_name: string | null }[]
  ).map((p) => {
    const r = partnerSlots.get(p.session_id);
    return {
      session_id: p.session_id,
      org_name: p.org_name,
      format: p.format,
      title_de: p.title_de,
      stage_name: p.stage_name,
      when: r ? zeit(r.start_at, r.end_at, r.day_date) : null,
    };
  });

  // Hauptbühnen: platziert, nicht veröffentlicht, nicht abgesagt.
  const partnerIds = new Set(partner.map((p) => p.session_id));
  const standbuehnen = new Set(data.stages.filter((s) => s.type === "partner_booth").map((s) => s.id));
  const buehnen: BuehnenFreigabe[] = data.rows
    .filter(
      (r) =>
        r.session_id &&
        !partnerIds.has(r.session_id) &&
        !standbuehnen.has(r.stage_id) &&
        (r.publish_status === "draft" || r.publish_status === "review"),
    )
    .map((r) => ({
      session_id: r.session_id as string,
      title_de: r.title_de,
      title_en: r.title_en,
      format: r.format,
      when: zeit(r.start_at, r.end_at, r.day_date),
      stage_name: r.stage_name,
      speakers: r.speakers?.length ?? 0,
      // `?tag=` ist das Datum, nicht die Kennung des Tages (`loadBoard`).
      boardHref: `${BASE}?event=${ev.slug}&tag=${r.day_date}`,
    }));

  return (
    <>
      <PageHeader word={t.admin.words.programme} title={t.admin.programme.title} description={t.admin.programme.lead} />
      <TableTabs basePath={BASE} withRelease />
      <FreigabeListe
        partner={partner}
        buehnen={buehnen}
        canRelease={canPublishSessions(roleNames)}
        formatLabels={data.labels.format}
        t={t.admin.programmeRelease}
        rpcMessages={t.rpc}
      />
    </>
  );
}

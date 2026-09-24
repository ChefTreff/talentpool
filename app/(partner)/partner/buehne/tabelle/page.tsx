import { notFound } from "next/navigation";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { TableTabs } from "@/components/programme/TableTabs";
import { loadProgrammeTable } from "@/components/programme/loadTable";
import { speakerName } from "@/components/programme/types";
import { fensterText } from "@/components/partner/standbuehne";
import { formatDay } from "@/lib/tz";
import type { PartnerFormatSession } from "../../talk/types";
import { getPartnerScope } from "../../org";
import { ladeEigeneBuehnen, ladeFenster } from "../daten";
import { StandInfo } from "../StandInfo";
import { StandTabelle, type StandTag, type StandZeile } from "../StandTabelle";

export const dynamic = "force-dynamic";

const BASE = "/partner/buehne";

/**
 * Die eigene Standbühne als Tabelle (PART-078) — zweiter Reiter neben dem
 * Kalender. Gelesen wird wie im Board: `programme_board` mit dem
 * Sitzungs-Client, `can_edit` je Zeile aus der Datenbank. Die Beschreibungen
 * kommen aus `session` (für `standbuehne_editor` lesbar, `is_programme_reader`),
 * offene Rückgaben aus `partner_format_sessions` (PART-083).
 */
export default async function PartnerStageTablePage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string }>;
}) {
  await requireArea("partner", `${BASE}/tabelle`);
  const { t } = await getI18n("de");
  const { event } = await searchParams;
  const { current } = await getPartnerScope();
  if (!current) notFound();

  const kopf = (
    <PageHeader word={t.partner.wordProgramme} title={t.partnerStage.title} description={t.partnerStage.lead} />
  );
  // Nur die Bühnen der gewählten Organisation: mit ihr als Gastgeberin legt die
  // Tabelle neue Sessions an (`upsert_session` verlangt sie beim Bühnen-Editor).
  const eigene = (await ladeEigeneBuehnen()).filter((s) => s.org_id === current.org_id);
  if (eigene.length === 0) {
    return (
      <>
        {kopf}
        <EmptyState title={t.partnerStage.emptyTitle} description={t.partnerStage.emptyBody} />
      </>
    );
  }

  const data = await loadProgrammeTable({
    eventSlug: event ?? eigene[0].event_slug ?? undefined,
    fallbackLocale: "de",
    editionIds: [...new Set(eigene.map((s) => s.edition_id))],
  });

  // Standbühne heißt `partner_booth`: Interview Tables und Side-Event-Orte haben
  // eigene Seiten, und das Zeitfenster gilt nur hier.
  const eigeneIds = new Set(eigene.map((s) => s.stage_id));
  const buehnen = data.stages.filter((s) => eigeneIds.has(s.id) && s.type === "partner_booth");
  if (!data.currentEvent || buehnen.length === 0) {
    return (
      <>
        {kopf}
        <TableTabs basePath={BASE} locale="de" />
        <EmptyState title={t.partnerStage.emptyTitle} description={t.partnerStage.emptyBody} />
      </>
    );
  }

  const buehnenIds = new Set(buehnen.map((b) => b.id));
  const rows = data.rows.filter((r) => buehnenIds.has(r.stage_id));
  const sessionIds = rows.map((r) => r.session_id).filter((x): x is string => !!x);

  const supabase = await createSupabaseServerClient();
  const beschreibung = new Map<string, { description_de: string | null; description_en: string | null }>();
  if (sessionIds.length > 0) {
    const { data: texte } = await supabase
      .from("session")
      .select("id, description_de, description_en")
      .in("id", sessionIds);
    for (const x of (texte ?? []) as { id: string; description_de: string | null; description_en: string | null }[]) {
      beschreibung.set(x.id, x);
    }
  }
  const { data: formate } = await supabase.rpc("partner_format_sessions", {
    p_org_id: current.org_id,
    p_edition_id: current.edition_id,
  });
  const rueckgaben = new Map(((formate ?? []) as PartnerFormatSession[]).map((x) => [x.id, x]));

  const zeilen: StandZeile[] = rows.map((r) => {
    const b = r.session_id ? beschreibung.get(r.session_id) : undefined;
    const rr = r.session_id ? rueckgaben.get(r.session_id) : undefined;
    return {
      slot_id: r.slot_id,
      stage_id: r.stage_id,
      event_day_id: r.event_day_id,
      day_date: r.day_date,
      start_at: r.start_at,
      end_at: r.end_at,
      session_id: r.session_id,
      title_de: r.title_de,
      title_en: r.title_en,
      description_de: b?.description_de ?? null,
      description_en: b?.description_en ?? null,
      format: r.format,
      publish_status: r.publish_status,
      speakers: (r.speakers ?? []).map(speakerName),
      return_note: rr?.return_note ?? null,
      returned_at: rr?.returned_at ?? null,
      can_edit: r.can_edit,
    };
  });

  const tage: StandTag[] = data.days.map((d) => {
    const label = data.locale === "en" ? d.label_en ?? d.label_de : d.label_de ?? d.label_en;
    const datum = formatDay(d.day_date, t.meta.dateLocale);
    return { id: d.id, day_date: d.day_date, label: label ? `${label} · ${datum}` : datum };
  });
  const fenster = await ladeFenster(
    [...buehnenIds],
    tage.map((d) => d.id),
  );
  const fensterListe = buehnen.flatMap((b) =>
    tage.map((d) => ({
      label: buehnen.length > 1 ? `${b.name} · ${d.label}` : d.label,
      text: fensterText(fenster[`${b.id}|${d.id}`], t.partnerStage.windowUntil),
    })),
  );

  return (
    <>
      {kopf}
      <TableTabs basePath={BASE} locale="de" />
      <StandInfo eigene={buehnen.map((b) => b.name).join(" · ")} fenster={fensterListe} t={t.partnerStage} legende />
      <StandTabelle
        zeilen={zeilen}
        tage={tage}
        buehnen={buehnen.map((b) => ({ id: b.id, name: b.name, default_duration_min: b.default_duration_min }))}
        fenster={fenster}
        eventId={data.currentEvent.id}
        hostOrgId={current.org_id}
        timezone={data.currentEvent.timezone}
        dateLocale={t.meta.dateLocale}
        formatLabels={data.labels.format}
        t={t.partnerStage}
        rueckgabe={{ badge: t.partner.returnedBadge, title: t.partner.returnedTitle, next: t.partner.returnedNext }}
        rpcMessages={t.rpc}
      />
    </>
  );
}

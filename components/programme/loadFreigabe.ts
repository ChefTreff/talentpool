import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getI18n } from "@/lib/i18n";
import { formatDay, formatMinutes, minutesOfDay } from "@/lib/tz";
import { canPublishSessions } from "./permissions";
import { loadProgrammeTable } from "./loadTable";
import type { BuehnenFreigabe, PartnerFreigabe } from "./FreigabeListe";

/** Basis der Programmseiten im Admin — wohin „Im Board öffnen“ führt. */
const BASE = "/admin/programm";

export type SlotFreigaben = {
  /** Es gibt keine Veranstaltung — die Seite sagt es, statt eine leere Liste zu zeigen. */
  keinEvent: boolean;
  partner: PartnerFreigabe[];
  buehnen: BuehnenFreigabe[];
  canRelease: boolean;
  formatLabels: Record<string, string>;
};

/**
 * Was eingetragen, aber noch nicht draussen ist (LEAD-022; seit ADM-072 Teil der
 * zentralen Freigaben). Der Ladecode stand in `programm/freigabe/page.tsx`; die
 * zentrale Seite braucht ihn auch für den Zähler, deshalb eine Stelle.
 *
 * Zwei Listen, weil es für die Programmleitung **eine** Frage ist: Standbühnen
 * stehen in `review` (`partner_create_session` legt sie so an), Hauptbühnen sind
 * alles, was einen Slot hat und noch nicht veröffentlicht ist. Die Hauptbühnen
 * sind bewusst **alle** noch offenen, nicht nur die mit Stage Lead: die
 * Programmleitung gibt frei, egal wer den Slot gefüllt hat.
 */
export async function loadSlotFreigaben(roleNames: readonly string[]): Promise<SlotFreigaben> {
  const { t } = await getI18n();
  const data = await loadProgrammeTable({});
  if (!data.currentEvent) {
    return { keinEvent: true, partner: [], buehnen: [], canRelease: canPublishSessions(roleNames), formatLabels: {} };
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
    (pending ?? []) as {
      session_id: string;
      org_name: string | null;
      format: string | null;
      title_de: string | null;
      stage_name: string | null;
    }[]
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

  // Hauptbühnen: platziert, nicht veröffentlicht, nicht abgesagt. **Dieselbe Regel steht in
  // `freigabe_zaehler()`** (Menü-Zähler, ADM-072b) — Bühnenart aus der Sicht selbst, nicht aus der Liste der aktiven
  // Bühnen, damit eine inaktive Standbühne hier nicht anders gezählt wird als im Menü.
  const partnerIds = new Set(partner.map((p) => p.session_id));
  const buehnen: BuehnenFreigabe[] = data.rows
    .filter(
      (r) =>
        r.session_id &&
        !partnerIds.has(r.session_id) &&
        r.stage_type !== "partner_booth" &&
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

  return {
    keinEvent: false,
    partner,
    buehnen,
    canRelease: canPublishSessions(roleNames),
    formatLabels: data.labels.format,
  };
}

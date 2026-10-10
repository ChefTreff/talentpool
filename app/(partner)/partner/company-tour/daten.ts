import "server-only";
import { notFound } from "next/navigation";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { instanzKennung, stoppWahlMitTexten } from "@/lib/partner/instanz";
import type { TourStopp } from "@/components/partner/tour";
import { getPartnerScope } from "../org";
import { canEditOnboarding, type PartnerOverview } from "../types";

/**
 * Was alle drei Reiter der Company Tour brauchen: die Stopps dieser
 * Organisation (`partner_company_tour`), ob das Format gebucht ist, und ob die
 * Person pflegen darf. Die Stopps setzt das Team (Admin → Company Tours); ohne
 * Stopp gibt es nur den Hinweis, dass die Zuordnung noch kommt.
 *
 * **Mehrere Stopps (QS-079):** `instanz` ist `searchParams.instanz`, die Kennung des Stopps. Der gewählte Stopp (`gewaehlt`) ist der gewünschte,
 * sonst der, zu dem noch nichts gespeichert ist, sonst der erste; eine unbekannte Kennung ist kein Fehler. `instanzen` ist der Umschalter und gibt es
 * erst ab zwei Stopps (je Tour besetzt ein Partner höchstens einen, mehrere heißt also mehrere Touren). Alle drei Reiter rufen das mit derselben Regel auf,
 * damit der Wechsel zwischen ihnen den Stopp nicht ändert.
 */
export async function ladeTour(instanz?: string | string[]) {
  const { locale, t } = await getI18n("de");
  const { current } = await getPartnerScope();
  if (!current) notFound();
  const supabase = await createSupabaseServerClient();
  const args = { p_org_id: current.org_id, p_edition_id: current.edition_id };
  const [{ data: overviewJson }, { data: stoppZeilen }] = await Promise.all([
    supabase.rpc("partner_overview", args),
    supabase.rpc("partner_company_tour", args),
  ]);
  const overview = (overviewJson ?? null) as PartnerOverview | null;
  const stopps = (stoppZeilen ?? []) as TourStopp[];
  const { gewaehlt, instanzen } = stoppWahlMitTexten(stopps, instanzKennung(instanz), t.partnerTour);
  return {
    supabase,
    locale,
    t,
    stopps,
    gewaehlt,
    instanzen,
    gebucht: (overview?.products ?? []).some((p) => p.format_key === "company_tour"),
    canEdit: overview ? canEditOnboarding(overview.roles, overview.team) : false,
  };
}

/** „Freitag, 16. April, 11:30–14:00“ in der Zone des Summits; `null`, wenn der Beginn fehlt. */
export function zeitraum(von: string | null, bis: string | null, dateLocale: string): string | null {
  if (!von) return null;
  const tag = new Intl.DateTimeFormat(dateLocale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  });
  const uhr = new Intl.DateTimeFormat(dateLocale, { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
  return bis ? `${tag.format(new Date(von))}–${uhr.format(new Date(bis))}` : tag.format(new Date(von));
}

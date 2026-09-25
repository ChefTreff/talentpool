import "server-only";
import { notFound } from "next/navigation";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPartnerScope } from "../org";
import type { PartnerFormatSession } from "../talk/types";
import { canEditOnboarding, type PartnerOverview } from "../types";

/**
 * Was alle Reiter der Masterclass brauchen: die Masterclass-Sessions dieser
 * Organisation (`partner_format_sessions`, Format `masterclass`), ob das
 * Produkt gebucht ist und ob die Person pflegen darf. Die Session und ihren
 * Slot legt das Team an (PART-045: „auf dem vom Team vergebenen Slot“).
 */
export async function ladeMasterclass() {
  const { locale, t } = await getI18n("de");
  const { current } = await getPartnerScope();
  if (!current) notFound();
  const supabase = await createSupabaseServerClient();
  const args = { p_org_id: current.org_id, p_edition_id: current.edition_id };
  const [{ data: overviewJson }, { data: sessionZeilen }] = await Promise.all([
    supabase.rpc("partner_overview", args),
    supabase.rpc("partner_format_sessions", { ...args, p_format: "masterclass" }),
  ]);
  const overview = (overviewJson ?? null) as PartnerOverview | null;
  return {
    supabase,
    locale,
    t,
    current,
    sessions: (sessionZeilen ?? []) as PartnerFormatSession[],
    gebucht: (overview?.products ?? []).some((p) => p.format_key === "masterclass"),
    canEdit: overview ? canEditOnboarding(overview.roles, overview.team) : false,
  };
}

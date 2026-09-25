import "server-only";
import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPartnerScope } from "../org";
import type { SessionFrage } from "@/components/partner/fragen";
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

/**
 * Fragen einer Session mit Text. `session_question` ist für den Partner seiner
 * Sessions lesbar (`is_session_visible`), `question_catalog` für alle
 * Angemeldeten — die Texte kommen also direkt aus den Tabellen, nicht über eine
 * eigene RPC.
 */
export async function ladeFragen(supabase: SupabaseClient, sessionId: string): Promise<SessionFrage[]> {
  const { data } = await supabase
    .from("session_question")
    .select("id, question_id, label_de, label_en, type, required, sort_order, approved_at, purpose, question_catalog(key, label_de, label_en, type)")
    .eq("session_id", sessionId)
    .order("sort_order");
  type Zeile = {
    id: string;
    question_id: string | null;
    label_de: string | null;
    label_en: string | null;
    type: string | null;
    required: boolean;
    sort_order: number;
    approved_at: string | null;
    purpose: string | null;
    question_catalog: { key: string; label_de: string; label_en: string; type: string } | null;
  };
  return ((data ?? []) as unknown as Zeile[]).map((q) => ({
    key: q.question_id ?? q.id,
    id: q.id,
    question_id: q.question_id,
    label_de: q.question_catalog?.label_de ?? q.label_de ?? "—",
    label_en: q.question_catalog?.label_en ?? q.label_en ?? q.label_de ?? "—",
    type: q.question_catalog?.type ?? q.type,
    required: q.required,
    sort_order: q.sort_order,
    approved_at: q.approved_at,
    purpose: q.purpose,
    catalog_key: q.question_catalog?.key ?? null,
  }));
}

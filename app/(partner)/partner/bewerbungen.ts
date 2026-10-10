import "server-only";
import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SessionFrage } from "@/components/partner/fragen";
import { getPartnerScope } from "./org";
import type { PartnerFormatSession } from "./talk/types";
import { canEditOnboarding, type PartnerOverview } from "./types";

/**
 * Fragen mehrerer Sessions mit Text, in **einer** Abfrage (PART-150: ein Tisch hat leicht zwanzig Gespräche). `session_question` ist für den Partner seiner
 * Sessions lesbar (`is_session_visible`), `question_catalog` für alle Angemeldeten — die Texte kommen also direkt aus den Tabellen, nicht über eine
 * eigene RPC. Jede angefragte Session steht in der Antwort, auch ohne Fragen (leere Liste); innerhalb einer Session gilt die Reihenfolge `sort_order`.
 */
export async function ladeFragenJe(supabase: SupabaseClient, sessionIds: string[]): Promise<Map<string, SessionFrage[]>> {
  const je = new Map<string, SessionFrage[]>(sessionIds.map((id) => [id, []]));
  if (sessionIds.length === 0) return je;
  const { data } = await supabase
    .from("session_question")
    .select("session_id, id, question_id, label_de, label_en, type, options, required, sort_order, approved_at, purpose, question_catalog(key, label_de, label_en, type)")
    .in("session_id", sessionIds)
    .order("sort_order");
  type Zeile = {
    session_id: string;
    id: string;
    question_id: string | null;
    label_de: string | null;
    label_en: string | null;
    type: string | null;
    options: unknown;
    required: boolean;
    sort_order: number;
    approved_at: string | null;
    purpose: string | null;
    question_catalog: { key: string; label_de: string; label_en: string; type: string } | null;
  };
  for (const q of (data ?? []) as unknown as Zeile[]) {
    je.get(q.session_id)?.push({
      key: q.question_id ?? q.id,
      id: q.id,
      question_id: q.question_id,
      label_de: q.question_catalog?.label_de ?? q.label_de ?? "—",
      label_en: q.question_catalog?.label_en ?? q.label_en ?? q.label_de ?? "—",
      type: q.question_catalog?.type ?? q.type,
      options: q.options ?? null,
      required: q.required,
      sort_order: q.sort_order,
      approved_at: q.approved_at,
      purpose: q.purpose,
      catalog_key: q.question_catalog?.key ?? null,
    });
  }
  return je;
}

/**
 * Katalogfragen, die Partner für ihre Formate wählen dürfen: `partner_selectable` und aktiv. Der Katalog kommt direkt aus `question_catalog` (für Angemeldete
 * lesbar); Upload-Fragen (`file`) bleiben draussen, solange das Bewerbungsformular sie nicht kann — dieselbe Regel wie im Board.
 */
export async function ladeWaehlbareFragen(supabase: SupabaseClient, locale: string): Promise<{ id: string; label: string }[]> {
  const { data } = await supabase
    .from("question_catalog")
    .select("id, label_de, label_en")
    .eq("partner_selectable", true)
    .eq("active", true)
    .neq("type", "file")
    .order("sort_order");
  return ((data ?? []) as { id: string; label_de: string; label_en: string }[]).map((q) => ({
    id: q.id,
    label: (locale === "en" ? q.label_en : q.label_de) || q.label_de,
  }));
}

/** Fragen einer Session mit Text (siehe `ladeFragenJe`). */
export async function ladeFragen(supabase: SupabaseClient, sessionId: string): Promise<SessionFrage[]> {
  return (await ladeFragenJe(supabase, [sessionId])).get(sessionId) ?? [];
}

/**
 * Was die Bewerbungsreiter eines eigenen Formats brauchen (PART-082): die
 * Sessions dieses Formats der gewählten Organisation und ob die Person pflegen
 * darf. Dieselbe Quelle wie die Formatseiten selbst (`partner_format_sessions`).
 */
export async function ladeEigenesFormat(format: "side_event" | "interview_table") {
  const { locale, t } = await getI18n("de");
  const { current } = await getPartnerScope();
  if (!current) notFound();
  const supabase = await createSupabaseServerClient();
  const args = { p_org_id: current.org_id, p_edition_id: current.edition_id };
  const [{ data: overviewJson }, { data: sessionZeilen }] = await Promise.all([
    supabase.rpc("partner_overview", args),
    supabase.rpc("partner_format_sessions", { ...args, p_format: format }),
  ]);
  const overview = (overviewJson ?? null) as PartnerOverview | null;
  return {
    supabase,
    locale,
    t,
    current,
    sessions: (sessionZeilen ?? []) as PartnerFormatSession[],
    canEdit: overview ? canEditOnboarding(overview.roles, overview.team) : false,
  };
}

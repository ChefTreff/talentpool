import "server-only";
import { notFound } from "next/navigation";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { brauchtInhalt, instanzKennung, instanzLeiste, instanzTitel, kurzSlot, waehleInstanz } from "@/lib/partner/instanz";
import { rueckgabeOffen } from "../Rueckgabe";
import { getPartnerScope } from "../org";
import type { PartnerFormatSession } from "../talk/types";
import { canEditOnboarding, type PartnerOverview } from "../types";

/**
 * Was alle Reiter der Masterclass brauchen: die Masterclass-Sessions dieser
 * Organisation (`partner_format_sessions`, Format `masterclass`), ob das
 * Produkt gebucht ist und ob die Person pflegen darf. Die Session und ihren
 * Slot legt das Team an (PART-045: „auf dem vom Team vergebenen Slot“).
 *
 * **Mehrere Masterclasses (QS-079):** `instanz` ist `searchParams.instanz`. Die gewählte Masterclass
 * (`gewaehlt`) ist die gewünschte, sonst die, die etwas von der Person will — von der Programmleitung
 * zurückgegeben, sonst ohne Titel oder Beschreibung —, sonst die erste; eine unbekannte Kennung ist
 * kein Fehler. `instanzen` ist der Umschalter und gibt es erst ab zwei Masterclasses. Alle vier Reiter
 * rufen das mit derselben Regel auf, damit der Wechsel zwischen ihnen die Masterclass nicht ändert.
 */
export async function ladeMasterclass(instanz?: string | string[]) {
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
  const sessions = (sessionZeilen ?? []) as PartnerFormatSession[];
  const gewaehlt = waehleInstanz(sessions, instanzKennung(instanz), (liste) => liste.find((x) => rueckgabeOffen(x)) ?? liste.find(brauchtInhalt));
  const titel = instanzTitel(
    sessions.map((x) => ({ titel: (locale === "en" ? x.title_en : x.title_de) ?? x.title_de, slot: kurzSlot(x.starts_at, t.meta.dateLocale) })),
    (n) => t.partnerMasterclass.instanceNumber.replace("{n}", String(n)),
  );
  return {
    supabase,
    locale,
    t,
    current,
    sessions,
    gewaehlt,
    instanzen: instanzLeiste(sessions.map((x, i) => ({ id: x.id, label: titel[i] })), gewaehlt?.id),
    gebucht: (overview?.products ?? []).some((p) => p.format_key === "masterclass"),
    canEdit: overview ? canEditOnboarding(overview.roles, overview.team) : false,
  };
}

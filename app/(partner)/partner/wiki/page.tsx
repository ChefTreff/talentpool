import { requireArea } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { gebuchteFormate } from "@/components/partner/wiki-formate";
import { WikiPage } from "@/components/wiki/WikiPage";
import { getPartnerScope } from "../org";
import type { PartnerOverview } from "../types";

export const dynamic = "force-dynamic";

/**
 * Das Partner-Wiki zeigt die allgemeinen Artikel und die zu den **gebuchten** Leistungen (PART-103): ein Masterclass-Artikel nur für Partner
 * mit Masterclass. Die Formate kommen aus den Produkten der gewählten Organisation (`partner_overview.products`). Wer keine eigene
 * Organisation hat (Team) oder dessen Übersicht nicht lädt, sieht alle Artikel der Zielgruppe: der Filter ist Relevanz, kein Zugriffsschutz,
 * und ein Fehler soll Artikel nicht verstecken.
 */
export default async function PartnerWikiPage() {
  await requireArea("partner", "/partner/wiki");
  const { current } = await getPartnerScope();
  let formats: string[] | null = null;
  if (current) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.rpc("partner_overview", { p_org_id: current.org_id, p_edition_id: current.edition_id });
    const overview = (data ?? null) as PartnerOverview | null;
    formats = overview ? gebuchteFormate(overview.products) : null;
  }
  return <WikiPage audience="partner" locale="de" formats={formats} />;
}

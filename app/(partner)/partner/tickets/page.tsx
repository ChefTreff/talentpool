import Link from "next/link";
import { notFound } from "next/navigation";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmbedGate } from "@/components/ui/EmbedGate";
import { loadVideo, loomEmbedUrl } from "@/components/video/load";
import { getPartnerScope } from "../org";
import { canEditOnboarding, type PartnerOverview, type TicketAllocationRow } from "../types";
import { TicketView } from "./TicketView";

export const dynamic = "force-dynamic";

/**
 * Kontingente, Codes und der Secret Shop.
 *
 * Code und Link kommen nur bei `status = active` aus der RPC — bis vivenu den
 * Coupon angelegt hat, steht hier die Menge und sonst nichts. Das ist keine
 * Auslassung der Oberfläche, sondern der Stand der Dinge.
 */
export default async function PartnerTicketsPage() {
  await requireArea("partner", "/partner/tickets");
  const { locale, t } = await getI18n("de");
  const { current } = await getPartnerScope();
  if (!current) notFound();

  const supabase = await createSupabaseServerClient();
  const [{ data: rows }, { data: overviewJson }, vocab] = await Promise.all([
    supabase.rpc("my_ticket_allocations", {
      p_org_id: current.org_id,
      p_edition_id: current.edition_id,
    }),
    supabase.rpc("partner_overview", {
      p_org_id: current.org_id,
      p_edition_id: current.edition_id,
    }),
    loadVocabMap(supabase, locale),
  ]);
  // Die Anleitung hängt an einem Schlüssel; der Link dahinter ist
  // Redaktionssache (F9.4).
  const video = await loadVideo("partner_tickets", "partner", current.edition_id);
  const allocations = (rows ?? []) as TicketAllocationRow[];
  const overview = (overviewJson ?? null) as PartnerOverview | null;

  return (
    <>
      <PageHeader title={t.partnerTickets.title} description={t.partnerTickets.lead} />
      {allocations.length === 0 ? (
        <EmptyState
          title={t.partnerTickets.emptyTitle}
          description={t.partnerTickets.emptyBody}
        />
      ) : (
        <TicketView
          orgId={current.org_id}
          allocations={allocations}
          passTypes={vgroup(vocab, "ticket_type")}
          // Anfragen darf, wer auch sonst für die Org handeln darf; die RPC
          // prüft es noch einmal.
          canRequest={canEditOnboarding(overview?.roles ?? [], overview?.team ?? false)}
          dateLocale={t.meta.dateLocale}
          t={t.partnerTickets}
          common={{ cancel: t.common.cancel, none: t.common.none, choose: t.common.choose }}
          rpcMessages={t.rpc}
        />
      )}

      {video && (
        <div className="mt-8 max-w-[640px]">
          <EmbedGate
            src={loomEmbedUrl(video.url)}
            title={(locale === "en" ? video.title_en : video.title_de) ?? t.partnerTickets.videoTitle}
            provider="Loom"
            loadLabel={t.common.loadVideo}
            notice={t.common.embedNotice}
            openLabel={t.common.openAtProvider}
          />
        </div>
      )}

      <p className="ct-help mt-6">
        {t.partnerTickets.wikiHint}{" "}
        <Link className="ct-link" href="/partner/wiki">
          {t.partner.navWiki}
        </Link>
      </p>
    </>
  );
}

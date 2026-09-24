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
import {
  canEditOnboarding,
  type PartnerOverview,
  type TicketAllocationRow,
  type TicketRequestRow,
} from "../types";
import { TicketView } from "./TicketView";

export const dynamic = "force-dynamic";

/** Der Wiki-Artikel zu Tickets — öffnet über den Anker direkt (WikiView). */
const WIKI_TICKETS = "/partner/wiki#tickets-akkreditierung";

/**
 * Kontingente, Codes, Ticketshop, Zusatzkontingent und wie man einlöst
 * (PART-066…071, Konrads Runde vom 21.09.).
 *
 * Code und Shop-Link kommen nur bei `status = active` aus der RPC — bis vivenu
 * den Coupon angelegt hat, steht hier die Menge und sonst nichts. Das ist keine
 * Auslassung der Oberfläche, sondern der Stand der Dinge.
 */
export default async function PartnerTicketsPage() {
  await requireArea("partner", "/partner/tickets");
  const { locale, t } = await getI18n("de");
  const { current } = await getPartnerScope();
  if (!current) notFound();

  const supabase = await createSupabaseServerClient();
  const args = { p_org_id: current.org_id, p_edition_id: current.edition_id };
  const [{ data: rows }, { data: requestRows }, { data: overviewJson }, vocab] = await Promise.all([
    supabase.rpc("my_ticket_allocations", args),
    supabase.rpc("my_ticket_requests", args),
    supabase.rpc("partner_overview", args),
    loadVocabMap(supabase, locale),
  ]);
  // Die Anleitung hängt an einem Schlüssel; der Link dahinter ist
  // Redaktionssache (F9.4).
  const video = await loadVideo("partner_tickets", "partner", current.edition_id);
  const allocations = (rows ?? []) as TicketAllocationRow[];
  const requests = (requestRows ?? []) as TicketRequestRow[];
  const overview = (overviewJson ?? null) as PartnerOverview | null;
  const s = t.partnerTickets;

  // Ein Undershop je Organisation und Edition — der Link ist für alle aktiven
  // Kontingente derselbe. Stünden je Kontingent verschiedene da (sollte es
  // nicht geben), wäre ein einzelner Knopf eine Behauptung; dann kein Knopf.
  const shopUrls = [
    ...new Set(allocations.filter((a) => a.status === "active" && a.undershop_url).map((a) => a.undershop_url!)),
  ];
  const shopUrl = shopUrls.length === 1 ? shopUrls[0] : null;

  // Die Frist aus `deadline.ticket_codes`. Abgelaufen bestimmt der Server:
  // der Countdown im Browser kennt „abgelaufen" und „noch nicht gerechnet"
  // nicht auseinander.
  const dueAt = allocations.find((a) => a.codes_due_at)?.codes_due_at ?? null;
  const tz = { timeZone: "Europe/Berlin" } as const;
  const dueText = dueAt
    ? new Intl.DateTimeFormat(t.meta.dateLocale, { dateStyle: "long", timeStyle: "short", ...tz }).format(new Date(dueAt))
    : null;
  const dueDay = dueAt
    ? new Intl.DateTimeFormat(t.meta.dateLocale, { day: "numeric", month: "long", ...tz }).format(new Date(dueAt))
    : null;
  // Wie auf Messestand, Branding und Hackathon: `new Date()` statt `Date.now()`
  // (die Regel des React-Compilers meldet nur Letzteres).
  const expired = dueAt !== null && new Date(dueAt) <= new Date();

  return (
    <>
      {/* PART-069: Konrads Einleitung im Wortlaut. */}
      <PageHeader title={s.title} description={s.lead} />
      {allocations.length === 0 ? (
        <EmptyState title={s.emptyTitle} description={s.emptyBody} />
      ) : (
        <TicketView
          orgId={current.org_id}
          allocations={allocations}
          requests={requests}
          passTypes={vgroup(vocab, "ticket_type")}
          // Anfragen darf, wer auch sonst für die Org handeln darf; die RPC
          // prüft es noch einmal.
          canRequest={canEditOnboarding(overview?.roles ?? [], overview?.team ?? false)}
          shopUrl={shopUrl}
          wikiHref={WIKI_TICKETS}
          dueAt={dueAt}
          dueText={dueText}
          expiredText={expired ? s.dueExpired : null}
          dueNote={dueDay ? (expired ? s.dueNoteAfter : s.dueNote.replace("{date}", dueDay)) : null}
          dateLocale={t.meta.dateLocale}
          t={s}
          common={{ cancel: t.common.cancel, none: t.common.none, choose: t.common.choose }}
          rpcMessages={t.rpc}
        />
      )}

      {video && (
        <div className="mt-8 max-w-form">
          <EmbedGate
            src={loomEmbedUrl(video.url)}
            title={(locale === "en" ? video.title_en : video.title_de) ?? s.videoTitle}
            provider="Loom"
            loadLabel={t.common.loadVideo}
            notice={t.common.embedNotice}
            openLabel={t.common.openAtProvider}
          />
        </div>
      )}
    </>
  );
}

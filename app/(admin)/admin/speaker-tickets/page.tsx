import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { SectionTabs } from "@/components/layout/SectionTabs";
import { ButtonDownload } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { TicketQueue, type AdminTicket } from "./TicketQueue";
import { KontingentTabelle } from "./KontingentTabelle";
import { AnlegenKnopf } from "./AnlegenKnopf";
import type { KontingentZeile } from "./BegleitticketDialog";

export const dynamic = "force-dynamic";

const PATH = "/admin/speaker-tickets";

/**
 * Speaker-Tickets (ADM-076, „final“): die Liste aller Tickets mit Lounge je Ticket, Ausstellen und Stornieren — und die
 * Ansicht **Kontingente** mit dem Begleitticket-Kontingent je Speaker. Dazu der eine primäre Knopf „Begleitticket anlegen“
 * und die Lounge-Liste fürs Personal als CSV.
 *
 * Die Kontingent-Ansicht liest `speaker_ticket_quotas()`. Fehlt die Funktion (die Migration ist noch nicht angewendet),
 * bleibt die Seite, wie sie war: ohne Reiter, ohne Anlegen-Knopf.
 */
export default async function AdminSpeakerTicketsPage({ searchParams }: { searchParams: Promise<{ ansicht?: string }> }) {
  await requireAdminSection("speakerTickets", PATH);
  const { locale, t } = await getI18n();
  const { ansicht } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const ta = t.admin.speakerTickets;

  const [{ data: rows, error }, quotaAntwort, vocab] = await Promise.all([
    supabase.rpc("speaker_tickets_admin"),
    supabase.rpc("speaker_ticket_quotas"),
    loadVocabMap(supabase, locale),
  ]);
  if (error) {
    return (
      <>
        <PageHeader word={t.admin.words.speakerTickets} title={ta.title} description={ta.lead} />
        <EmptyState title={ta.noAccessTitle} description={ta.noAccessBody} />
      </>
    );
  }

  const tickets = (rows ?? []) as AdminTicket[];
  const kontingente = quotaAntwort.error ? null : ((quotaAntwort.data ?? []) as KontingentZeile[]);
  const ansichtGewaehlt = ansicht === "kontingente" && kontingente ? "kontingente" : "tickets";
  // „Offen" heißt: hier wartet eine Entscheidung. Das Speaker-Ticket selbst
  // entsteht automatisch und wird von Vivenu ausgestellt — es steht zur
  // Information in der Liste, aber niemand muss es freigeben.
  const open = tickets.filter((x) => x.source === "speaker_companion" && x.status === "requested").length;
  const common = { cancel: t.common.cancel, none: t.common.none };

  return (
    <>
      <PageHeader
        word={t.admin.words.speakerTickets}
        title={ta.title}
        description={`${ta.lead} · ${open} ${ta.openCount}`}
        actions={
          <>
            {kontingente && <AnlegenKnopf speakers={kontingente} t={ta} rpcMessages={t.rpc} />}
            <ButtonDownload href={`${PATH}/lounge-liste`} variant="secondary">
              {ta.loungeList}
            </ButtonDownload>
          </>
        }
      />
      {kontingente && (
        <SectionTabs
          label={ta.tabsLabel}
          items={[
            { href: PATH, label: ta.tabTickets, aktiv: ansichtGewaehlt === "tickets" },
            { href: `${PATH}?ansicht=kontingente`, label: ta.tabQuotas, aktiv: ansichtGewaehlt === "kontingente" },
          ]}
        />
      )}
      {ansichtGewaehlt === "kontingente" && kontingente ? (
        <KontingentTabelle
          rows={kontingente}
          t={ta}
          common={{ none: t.common.none }}
          rpcMessages={t.rpc}
          passTypes={vgroup(vocab, "ticket_type")}
        />
      ) : tickets.length === 0 ? (
        <EmptyState title={ta.emptyTitle} description={ta.emptyBody} />
      ) : (
        <TicketQueue tickets={tickets} dateLocale={t.meta.dateLocale} t={ta} common={common} rpcMessages={t.rpc} />
      )}
    </>
  );
}

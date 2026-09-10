import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { TicketQueue, type AdminTicket } from "./TicketQueue";

export const dynamic = "force-dynamic";

export default async function AdminSpeakerTicketsPage() {
  await requireArea("admin", "/admin/speaker-tickets");
  const { t } = await getI18n();
  const supabase = await createSupabaseServerClient();

  const { data: rows, error } = await supabase.rpc("speaker_tickets_admin");
  if (error) {
    return (
      <>
        <PageHeader title={t.admin.speakerTickets.title} description={t.admin.speakerTickets.lead} />
        <EmptyState
          title={t.admin.speakerTickets.noAccessTitle}
          description={t.admin.speakerTickets.noAccessBody}
        />
      </>
    );
  }

  const tickets = (rows ?? []) as AdminTicket[];
  // „Offen" heißt: hier wartet eine Entscheidung. Das Speaker-Ticket selbst
  // entsteht automatisch und wird von Vivenu ausgestellt — es steht zur
  // Information in der Liste, aber niemand muss es freigeben.
  const open = tickets.filter(
    (x) => x.source === "speaker_companion" && x.status === "requested",
  ).length;

  return (
    <>
      <PageHeader
        title={t.admin.speakerTickets.title}
        description={`${t.admin.speakerTickets.lead} · ${open} ${t.admin.speakerTickets.openCount}`}
      />
      {tickets.length === 0 ? (
        <EmptyState
          title={t.admin.speakerTickets.emptyTitle}
          description={t.admin.speakerTickets.emptyBody}
        />
      ) : (
        <TicketQueue
          tickets={tickets}
          dateLocale={t.meta.dateLocale}
          t={t.admin.speakerTickets}
          common={{ cancel: t.common.cancel, none: t.common.none }}
          rpcMessages={t.rpc}
        />
      )}
    </>
  );
}

import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vlabel } from "@/lib/vocab";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { QrCode } from "@/components/ui/QrCode";
import { TicketCard } from "@/components/ui/TicketCard";

export const dynamic = "force-dynamic";

type Ticket = {
  ticket_id: string;
  edition_id: string;
  edition_name: string;
  pass_type: string | null;
  status: "valid" | "checked_in" | "requested";
  barcode: string | null;
  holder_first_name: string | null;
  holder_last_name: string | null;
  checked_in_at: string | null;
  wallet_available: boolean;
};

/**
 * „Tickets" in der Seitengruppe Summit (TAL-015). Nur die **eigenen** Tickets
 * (`person_id`), über `my_tickets()` — die Tabelle selbst gibt Teilnehmenden
 * nur den Code heraus (0074, Konrad 11.09.). Ausgestellte Tickets tragen die
 * Ticket-Form mit QR; alles andere ist ein Wartezustand und sieht nicht wie
 * ein Ticket aus (Muster `/speaker/tickets`).
 */
export default async function TicketsPage() {
  await requireArea("talent", "/tickets");
  const { locale, t } = await getI18n();
  const tt = t.talentTickets;
  const supabase = await createSupabaseServerClient();
  const [{ data }, vocab] = await Promise.all([supabase.rpc("my_tickets"), loadVocabMap(supabase, locale)]);
  const tickets = (data ?? []) as Ticket[];
  const zeit = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "de-DE", { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="max-w-text">
      <PageHeader word={tt.word} title={tt.title} description={tt.lead} />
      {tickets.length === 0 ? (
        <EmptyState title={tt.emptyTitle} description={tt.emptyBody} />
      ) : (
        <div className="flex flex-col gap-6">
          {tickets.map((k) => {
            const name = [k.holder_first_name, k.holder_last_name].filter(Boolean).join(" ") || k.edition_name;
            const pass = k.pass_type ? vlabel(vocab, "ticket_type", k.pass_type) : tt.ticket;
            if (k.status === "requested" || !k.barcode) {
              return (
                <Card key={k.ticket_id}>
                  <p className="ct-eyebrow text-muted">{k.edition_name}</p>
                  <h2 className="ct-h3 mt-1 text-ink">{pass}</h2>
                  <p className="ct-help mt-2">{tt.pending}</p>
                </Card>
              );
            }
            return (
              <TicketCard
                key={k.ticket_id}
                passType={`${k.edition_name} · ${pass}`}
                title={name}
                status={
                  <Badge tone="success">{k.status === "checked_in" ? tt.checkedIn : tt.valid}</Badge>
                }
                footer={
                  <div className="flex flex-wrap items-start gap-6">
                    <QrCode value={k.barcode} label={tt.qrAlt} />
                    <div className="min-w-0">
                      {k.checked_in_at && (
                        <p className="ct-help">
                          {tt.checkedIn}: {zeit.format(new Date(k.checked_in_at))}
                        </p>
                      )}
                      <p className="ct-help mt-2">{tt.qrHint}</p>
                      {k.wallet_available && (
                        <p className="mt-3">
                          <ButtonLink href={`/api/talent/ticket-wallet?ticket=${k.ticket_id}`} variant="secondary" size="sm">
                            {tt.walletAdd}
                          </ButtonLink>
                          <span className="ct-help mt-2 block">{tt.walletHint}</span>
                        </p>
                      )}
                    </div>
                  </div>
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

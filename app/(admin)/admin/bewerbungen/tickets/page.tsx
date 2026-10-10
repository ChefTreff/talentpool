import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vlabel } from "@/lib/vocab";
import { mailtoLink, summiere, type NichtPersonalisiert, type UebersichtZeile } from "@/lib/tickets/nicht-personalisiert";
import { SectionTabs } from "@/components/layout/SectionTabs";
import { Badge } from "@/components/ui/Badge";
import { ButtonDownload } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";

export const dynamic = "force-dynamic";

const PFAD = "/admin/bewerbungen";
const ANZEIGE = 200;

/**
 * Teilnehmer-Tickets: wer hat noch nicht personalisiert (TAL-019 Teil 2). Admin-Weg zum Personalisierungsformular
 * `/tickets/bestaetigung`: Zahlen je Veranstaltung (offen, teilweise, vollständig, Rückschreiben offen) und die Liste
 * der Tickets, bei denen Angaben fehlen — zum Nachfassen vor dem Summit, dazu die CSV.
 *
 * Nur Lesen. Gate wie die Bewerbungen (Abschnitt `applications`), dieselbe Rollenliste prüft die Datenbank in beiden
 * Funktionen. Fehlt die Funktion (Migration noch nicht angewendet), bleibt die Seite mit einer Fehlergrenze statt „0“.
 */
export default async function AdminTicketsPage() {
  await requireAdminSection("applications", `${PFAD}/tickets`);
  const { locale, t } = await getI18n();
  const a = t.admin.applications;
  const supabase = await createSupabaseServerClient();
  const [uebersicht, liste, vocab] = await Promise.all([
    supabase.rpc("ticket_personalization_overview"),
    supabase.rpc("tickets_unpersonalized", { p_limit: ANZEIGE + 1 }),
    loadVocabMap(supabase, locale),
  ]);
  if (uebersicht.error) throw new Error(`ticket_personalization_overview: ${uebersicht.error.message}`);
  if (liste.error) throw new Error(`tickets_unpersonalized: ${liste.error.message}`);
  const zeilen = (uebersicht.data ?? []) as UebersichtZeile[];
  const alle = (liste.data ?? []) as NichtPersonalisiert[];
  const abgeschnitten = alle.length > ANZEIGE;
  const sichtbar = alle.slice(0, ANZEIGE);
  const summe = summiere(zeilen);
  const zahl = new Intl.NumberFormat(t.meta.dateLocale);
  const stand: Record<string, string> = { pending: a.ticketsStatePending, partial: a.ticketsStatePartial };

  return (
    <>
      <PageHeader
        word={t.admin.words.applications}
        title={a.ticketsTitle}
        description={a.ticketsLead}
        actions={
          <ButtonDownload href={`${PFAD}/tickets/liste`} variant="secondary">
            {a.ticketsCsv}
          </ButtonDownload>
        }
      />
      <SectionTabs
        label={a.title}
        items={[
          { href: PFAD, label: a.tabList, exact: true },
          { href: `${PFAD}/sessions`, label: a.tabSessions },
          { href: `${PFAD}/tickets`, label: a.tabTickets },
        ]}
      />

      <div className="flex flex-col gap-8">
        <section aria-labelledby="h-ticket-stand" className="flex flex-col gap-3">
          <h2 id="h-ticket-stand" className="ct-h2 text-ink border-b pb-2">
            {a.ticketsCountsTitle}
          </h2>
          {zeilen.length === 0 ? (
            <EmptyState title={a.ticketsNoData} description={a.ticketsNoDataBody} />
          ) : (
            <div className="overflow-x-auto">
              <Table stapeln>
                <Thead>
                  <Th>{a.ticketsColEvent}</Th>
                  <Th numeric>{a.ticketsCountOpen}</Th>
                  <Th numeric>{a.ticketsCountPartial}</Th>
                  <Th numeric>{a.ticketsCountComplete}</Th>
                  <Th numeric>{a.ticketsCountWriteback}</Th>
                </Thead>
                <Tbody>
                  {zeilen.map((z) => (
                    <Tr key={z.event_id}>
                      <Td>{z.event_name}</Td>
                      <Td className="tabular-nums" numeric label={a.ticketsCountOpen}>{zahl.format(z.pending)}</Td>
                      <Td className="tabular-nums" numeric label={a.ticketsCountPartial}>{zahl.format(z.partial)}</Td>
                      <Td className="tabular-nums" numeric label={a.ticketsCountComplete}>{zahl.format(z.complete)}</Td>
                      <Td className="tabular-nums" numeric label={a.ticketsCountWriteback}>{zahl.format(z.writeback_open)}</Td>
                    </Tr>
                  ))}
                  {zeilen.length > 1 && (
                    <Tr>
                      <Td className="font-semibold">{a.ticketsTotal}</Td>
                      <Td className="tabular-nums font-semibold" numeric label={a.ticketsCountOpen}>{zahl.format(summe.pending)}</Td>
                      <Td className="tabular-nums font-semibold" numeric label={a.ticketsCountPartial}>{zahl.format(summe.partial)}</Td>
                      <Td className="tabular-nums font-semibold" numeric label={a.ticketsCountComplete}>{zahl.format(summe.complete)}</Td>
                      <Td className="tabular-nums font-semibold" numeric label={a.ticketsCountWriteback}>{zahl.format(summe.writebackOpen)}</Td>
                    </Tr>
                  )}
                </Tbody>
              </Table>
            </div>
          )}
        </section>

        <section aria-labelledby="h-ticket-liste" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline gap-2 border-b pb-2">
            <h2 id="h-ticket-liste" className="ct-h2 text-ink">
              {a.ticketsListTitle}
            </h2>
            <span className="ct-help ml-auto tabular-nums">{a.ticketsListCount.replace("{n}", zahl.format(summe.pending + summe.partial))}</span>
          </div>
          {sichtbar.length === 0 ? (
            <EmptyState title={a.ticketsEmptyTitle} description={a.ticketsEmptyBody} />
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table stapeln>
                  <Thead>
                    <Th>{a.ticketsColHolder}</Th>
                    <Th>{a.ticketsColBuyer}</Th>
                    <Th>{a.ticketsColPass}</Th>
                    <Th>{a.ticketsColState}</Th>
                    <Th>{a.ticketsColBought}</Th>
                    <Th>{a.ticketsColWriteback}</Th>
                  </Thead>
                  <Tbody>
                    {sichtbar.map((z) => (
                      <Tr key={z.ticket_id}>
                        <Td>
                          {[z.holder_first_name, z.holder_last_name].filter(Boolean).join(" ") || t.common.none}
                          {z.holder_company && <div className="ct-help">{z.holder_company}</div>}
                        </Td>
                        <Td className="break-all" label={a.ticketsColBuyer}>
                          {/* Zum Nachfassen: ein Klick öffnet das Mailprogramm (nur bei einer einfachen Adresse, sonst bleibt es Text). */}
                          {mailtoLink(z.buyer_email) ? (
                            <a href={mailtoLink(z.buyer_email) ?? undefined} className="ct-link">{z.buyer_email}</a>
                          ) : (
                            (z.buyer_email ?? t.common.none)
                          )}
                        </Td>
                        <Td label={a.ticketsColPass}>{z.pass_type ? vlabel(vocab, "ticket_type", z.pass_type) : t.common.none}</Td>
                        <Td label={a.ticketsColState}>
                          <Badge>{stand[z.personalization_status] ?? z.personalization_status}</Badge>
                        </Td>
                        <Td className="text-muted tabular-nums" label={a.ticketsColBought}>
                          {z.purchased_at ? new Date(z.purchased_at).toLocaleDateString(t.meta.dateLocale) : t.common.none}
                        </Td>
                        <Td label={a.ticketsColWriteback}>{z.writeback_open ? <Badge>{a.ticketsWritebackOpen}</Badge> : null}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </div>
              {abgeschnitten && <p className="ct-help">{a.ticketsListTruncated.replace("{n}", String(ANZEIGE))}</p>}
            </>
          )}
        </section>
      </div>
    </>
  );
}

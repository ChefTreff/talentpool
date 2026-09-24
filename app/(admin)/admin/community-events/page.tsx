import Link from "next/link";
import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { neuesFenster } from "@/components/ui/neues-fenster";

export const dynamic = "force-dynamic";

type Zeile = {
  event_id: string;
  luma_event_id: string;
  name: string;
  start_date: string | null;
  location: string | null;
  url: string | null;
  registered: number;
  pending: number;
  waitlisted: number;
  attended: number;
  total: number;
};

/**
 * „Community-Events" im Admin (TAL-008, D12): Sicht statt Pflege. Gepflegt
 * werden die Events in Luma; hier steht, wer aus dem Talent-Pool angemeldet
 * ist und teilgenommen hat — Grundlage für Segmente und Nachfass-Aktionen.
 */
export default async function CommunityEventsAdminPage() {
  await requireAdminSection("communityEvents", "/admin/community-events");
  const { locale, t } = await getI18n();
  const tt = t.communityEventsAdmin;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("community_events_admin");
  const zeilen = (data ?? []) as Zeile[];
  const datum = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "de-DE", { dateStyle: "medium" });

  return (
    <>
      <PageHeader word={t.admin.words.communityEvents} title={tt.title} description={tt.lead} />
      {zeilen.length === 0 ? (
        <EmptyState title={tt.empty} description={tt.emptyBody} />
      ) : (
        <Card className="overflow-x-auto p-0">
          <Table>
            <Thead>
              <Tr>
                <Th>{tt.colEvent}</Th>
                <Th>{tt.colDate}</Th>
                <Th numeric>{tt.colRegistered}</Th>
                <Th numeric>{tt.colPending}</Th>
                <Th numeric>{tt.colWaitlist}</Th>
                <Th numeric>{tt.colAttended}</Th>
                <Th>{""}</Th>
              </Tr>
            </Thead>
            <Tbody>
              {zeilen.map((z) => (
                <Tr key={z.event_id}>
                  <Td>
                    <Link href={`/admin/community-events/${z.event_id}`} className="ct-link">
                      {z.name}
                    </Link>
                    {z.location && <span className="ct-help block">{z.location}</span>}
                  </Td>
                  <Td>{z.start_date ? datum.format(new Date(z.start_date)) : "—"}</Td>
                  <Td numeric>{z.registered}</Td>
                  <Td numeric>{z.pending}</Td>
                  <Td numeric>{z.waitlisted}</Td>
                  <Td numeric>{z.attended}</Td>
                  <Td>
                    {z.url && (
                      <a href={z.url} {...neuesFenster} className="ct-link ct-small">
                        {tt.openLuma}
                      </a>
                    )}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Card>
      )}
    </>
  );
}

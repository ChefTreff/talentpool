import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { loadVocabMap, vlabel } from "@/lib/vocab";

export const dynamic = "force-dynamic";

type Gast = { person_id: string; first_name: string | null; last_name: string | null; status: string; registered_at: string };

/** Teilnehmende eines Community-Events aus dem Talent-Pool (TAL-008): Name und Status, keine Kontaktdaten. */
export default async function CommunityEventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdminSection("communityEvents", `/admin/community-events/${id}`);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { locale, t } = await getI18n();
  const tt = t.communityEventsAdmin;
  const supabase = await createSupabaseServerClient();
  const [{ data: events }, { data: gaeste }, vocab] = await Promise.all([
    supabase.rpc("community_events_admin"),
    supabase.rpc("community_event_guests_admin", { p_event_id: id }),
    loadVocabMap(supabase, locale),
  ]);
  const ev = ((events ?? []) as { event_id: string; name: string; location: string | null }[]).find((e) => e.event_id === id);
  if (!ev) notFound();
  const liste = (gaeste ?? []) as Gast[];
  const datum = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "de-DE", { dateStyle: "medium" });

  return (
    <>
      <Link href="/admin/community-events" className="ct-link ct-small">← {tt.back}</Link>
      <div className="mt-2">
        <PageHeader word={t.admin.words.communityEvents} title={ev.name} description={ev.location ?? undefined} />
      </div>
      <Card className="overflow-x-auto p-0">
        <h2 className="ct-h3 px-6 pt-6 text-ink">{tt.guests}</h2>
        <p className="ct-help px-6 pb-4">{tt.guestsHint}</p>
        {liste.length === 0 ? (
          <p className="ct-small px-6 pb-6 text-muted">{tt.guestsEmpty}</p>
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>{tt.colName}</Th>
                <Th>{tt.colStatus}</Th>
                <Th>{tt.colSince}</Th>
              </Tr>
            </Thead>
            <Tbody>
              {liste.map((g) => (
                <Tr key={g.person_id}>
                  <Td>{[g.first_name, g.last_name].filter(Boolean).join(" ") || "—"}</Td>
                  <Td>
                    <Badge tone={g.status === "attended" ? "success" : "neutral"}>
                      {vlabel(vocab, "registration_status", g.status)}
                    </Badge>
                  </Td>
                  <Td>{datum.format(new Date(g.registered_at))}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>
    </>
  );
}

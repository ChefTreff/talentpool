import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { Badge } from "@/components/ui/Badge";
import { ButtonDownload } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/Table";

export const dynamic = "force-dynamic";

/**
 * Benachrichtigungen im Admin (TAL-009): je Thema gewählt und anschreibbar
 * (Newsletter-Einwilligung erteilt, Adresse nicht gesperrt), dazu der Export je
 * Thema. Der ActiveCampaign-Sync ist ein eigener Baustein (K-43): ohne
 * Schlüssel steht hier „Verbindung fehlt“, der Export ist der Weg bis dahin.
 */
export default async function AdminBenachrichtigungenPage() {
  await requireAdminSection("notifications", "/admin/benachrichtigungen");
  const { locale, t } = await getI18n();
  const s = t.adminNotifications;
  const supabase = await createSupabaseServerClient();
  const [{ data }, vocab] = await Promise.all([
    supabase.rpc("notification_topic_stats"),
    loadVocabMap(supabase, locale),
  ]);
  const rows = (data ?? []) as { topic: string; chosen: number; reachable: number }[];
  const labels = vgroup(vocab, "notification_topic");
  const acVerbunden = Boolean(process.env.ACTIVECAMPAIGN_API_KEY?.trim() && process.env.ACTIVECAMPAIGN_API_URL?.trim());

  return (
    <>
      <PageHeader word={t.admin.words.notifications} title={s.title} description={s.lead} />
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader title={s.acTitle} description={acVerbunden ? s.acConnected : s.acMissing} />
          <Badge tone={acVerbunden ? "success" : "warning"}>{acVerbunden ? s.acStatusOn : s.acStatusOff}</Badge>
        </Card>
        <Card>
          <CardHeader title={s.topicsTitle} description={s.topicsLead} />
          <div className="overflow-x-auto">
            <Table>
              <Thead>
                <Tr>
                  <Th>{s.colTopic}</Th>
                  <Th>{s.colChosen}</Th>
                  <Th>{s.colReachable}</Th>
                  <Th>{""}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {rows.map((r) => (
                  <Tr key={r.topic} controls>
                    <Td>{labels[r.topic] ?? r.topic}</Td>
                    <Td className="tabular-nums">{r.chosen}</Td>
                    <Td className="tabular-nums">{r.reachable}</Td>
                    <Td>
                      {r.reachable > 0 && (
                        <ButtonDownload href={`/api/admin/benachrichtigungen/export?topic=${encodeURIComponent(r.topic)}`} size="sm" variant="ghost">
                          {s.export}
                        </ButtonDownload>
                      )}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </div>
        </Card>
      </div>
    </>
  );
}

import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { hasAcKey, acWriteEnabled } from "@/lib/activecampaign/client";
import { Badge } from "@/components/ui/Badge";
import { ButtonDownload } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/Table";

export const dynamic = "force-dynamic";

/**
 * Benachrichtigungen im Admin (TAL-009): je Thema gewählt und anschreibbar
 * (Newsletter-Einwilligung erteilt, Adresse nicht gesperrt), dazu der Export je
 * Thema. Der ActiveCampaign-Sync (K-43, `/api/cron/activecampaign-sync`) zeigt hier
 * seinen Stand: ohne Schlüssel „Verbindung fehlt“, mit Schlüssel erst als Trockenlauf,
 * der Export bleibt der Weg per Hand.
 */
export default async function AdminBenachrichtigungenPage() {
  await requireAdminSection("notifications", "/admin/benachrichtigungen");
  const { locale, t } = await getI18n();
  const s = t.adminNotifications;
  const supabase = await createSupabaseServerClient();
  const [{ data }, vocab, { data: acData }] = await Promise.all([
    supabase.rpc("notification_topic_stats"),
    loadVocabMap(supabase, locale),
    supabase.rpc("ac_sync_status"),
  ]);
  const ac = ((acData ?? []) as {
    contacts: number;
    pending_out: number;
    pending_withdrawn: number;
    last_status: string | null;
    last_at: string | null;
  }[])[0] ?? null;
  const rows = (data ?? []) as { topic: string; chosen: number; reachable: number }[];
  const labels = vgroup(vocab, "notification_topic");
  const acVerbunden = hasAcKey();
  const acSchreibt = acWriteEnabled();

  return (
    <>
      <PageHeader word={t.admin.words.notifications} title={s.title} description={s.lead} />
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader title={s.acTitle} description={acVerbunden ? s.acConnected : s.acMissing} />
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={acVerbunden ? "success" : "warning"}>{acVerbunden ? s.acStatusOn : s.acStatusOff}</Badge>
            {acVerbunden && <Badge tone={acSchreibt ? "success" : "neutral"}>{acSchreibt ? s.acWriteOn : s.acWriteOff}</Badge>}
          </div>
          {ac && (
            <p className="ct-small mt-3">
              {s.acNumbers
                .replace("{contacts}", String(ac.contacts))
                .replace("{out}", String(ac.pending_out))
                .replace("{withdrawn}", String(ac.pending_withdrawn))}
              {ac.last_at &&
                ` ${s.acLast
                  .replace("{status}", ac.last_status ?? "—")
                  .replace("{date}", new Intl.DateTimeFormat(t.meta.dateLocale, { dateStyle: "short", timeStyle: "short" }).format(new Date(ac.last_at)))}`}
            </p>
          )}
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

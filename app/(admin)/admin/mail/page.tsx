import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { TestMailForm } from "./TestMailForm";

export const dynamic = "force-dynamic";

type LogRow = {
  id: number | string;
  template_key: string;
  locale: string;
  to_email: string;
  status: string;
  provider_id: string | null;
  queued_at: string;
};

const TONES: Record<string, BadgeTone> = {
  sent: "success",
  delivered: "success",
  queued: "neutral",
  suppressed: "warning",
  bounced: "error",
  failed: "error",
};

export default async function MailPage() {
  // Gate je Seite, nicht nur im Layout: Layouts rendern bei Client-Navigation
  // nicht neu. Muss vor createSupabaseAdminClient() stehen.
  const ctx = await requireArea("admin", "/admin/mail");
  const admin = createSupabaseAdminClient();
  const { t } = await getI18n();

  const { data, error } = await admin
    .from("mail_log")
    .select("id,template_key,locale,to_email,status,provider_id,queued_at")
    .order("queued_at", { ascending: false })
    .limit(20);

  if (error) console.error("[admin/mail] mail_log nicht lesbar:", error.message);
  const rows = (data ?? []) as LogRow[];
  const dateFormat = new Intl.DateTimeFormat(t.meta.dateLocale, {
    dateStyle: "short",
    timeStyle: "short",
  });

  return (
    <div className="max-w-[1000px]">
      <PageHeader title={t.admin.mail.title} description={t.admin.mail.lead} />

      <Card className="mb-4">
        <TestMailForm
          defaultTo={ctx.user?.email ?? ""}
          labels={{
            recipient: t.admin.mail.recipient,
            send: t.admin.mail.send,
            sending: t.admin.mail.sending,
            sent: t.admin.mail.resultSent,
            suppressed: t.admin.mail.resultSuppressed,
            failed: t.admin.mail.resultFailed,
            dryRunHint: t.admin.mail.dryRunHint,
            required: t.common.required,
            messages: t.messages,
          }}
        />
      </Card>

      <h2 className="ct-h2 mb-3 text-ink">{t.admin.mail.recent}</h2>
      {rows.length === 0 ? (
        <EmptyState
          title={t.admin.mail.recent}
          description={t.admin.mail.lead}
        />
      ) : (
        <Table>
          <Thead>
            <Th>{t.admin.mail.colTime}</Th>
            <Th>{t.admin.mail.colTemplate}</Th>
            <Th>{t.admin.mail.colTo}</Th>
            <Th>{t.admin.mail.colStatus}</Th>
            <Th>{t.admin.mail.colProvider}</Th>
          </Thead>
          <Tbody>
            {rows.map((r) => (
              <Tr key={String(r.id)}>
                <Td className="text-muted">
                  {dateFormat.format(new Date(r.queued_at))}
                </Td>
                <Td>
                  {r.template_key}{" "}
                  <span className="text-muted">({r.locale})</span>
                </Td>
                <Td className="text-muted">{r.to_email}</Td>
                <Td>
                  <Badge tone={TONES[r.status] ?? "neutral"}>{r.status}</Badge>
                </Td>
                <Td className="font-mono text-[13px] text-muted">
                  {r.provider_id ?? t.common.none}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </div>
  );
}

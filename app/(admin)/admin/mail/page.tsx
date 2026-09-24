import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import type { SelectOption } from "@/components/ui/Select";
import { MailTabs } from "./MailTabs";
import { ProtokollView, type LogZeile } from "./ProtokollView";
import { TestMailForm } from "./TestMailForm";

export const dynamic = "force-dynamic";

const PRO_SEITE = 50;

/**
 * Tagesgrenze in Berliner Zeit.
 *
 * Das Protokoll wird nach Kalendertagen durchsucht — „seit dem 17." heisst
 * 00:00 Uhr in Hamburg, nicht in UTC. Der Unterschied sind zwei Stunden, und
 * die liegen genau dort, wo abends die Mails rausgehen.
 */
function tagesgrenze(tag: string | undefined, plusTage = 0): string | null {
  if (!tag || !/^\d{4}-\d{2}-\d{2}$/.test(tag)) return null;
  const roh = new Date(`${tag}T00:00:00Z`);
  roh.setUTCDate(roh.getUTCDate() + plusTage);
  const name = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Berlin", timeZoneName: "longOffset" })
    .formatToParts(roh)
    .find((p) => p.type === "timeZoneName")?.value;
  const treffer = /GMT([+-])(\d{2}):(\d{2})/.exec(name ?? "");
  const versatz = treffer
    ? (treffer[1] === "-" ? -1 : 1) * (Number(treffer[2]) * 60 + Number(treffer[3]))
    : 0;
  return new Date(roh.getTime() - versatz * 60_000).toISOString();
}

/**
 * Das Mail-Protokoll.
 *
 * `mail_log_admin()` prüft `has_role('admin')` selbst — wer den Admin-Bereich
 * über eine andere Rolle betritt, sieht den Hinweis und keinen Fehler. Gelesen
 * wird mit dem Nutzer-Client und nicht mit `service_role`: das Protokoll nennt
 * Empfängeradressen, und die Rechteprüfung gehört in die Datenbank.
 */
export default async function MailPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string; status?: string; vorlage?: string; von?: string; bis?: string; seite?: string;
  }>;
}) {
  const ctx = await requireAdminSection("mail", "/admin/mail");
  const { t } = await getI18n("de");
  const sp = await searchParams;
  const seite = Math.max(1, Number(sp.seite ?? "1") || 1);
  const supabase = await createSupabaseServerClient();

  const [protokoll, zahlen, vorlagen] = await Promise.all([
    supabase.rpc("mail_log_admin", {
      p_query: sp.q?.trim() || null,
      p_template: sp.vorlage || null,
      p_status: sp.status || null,
      p_person_id: null,
      p_from: tagesgrenze(sp.von),
      // Der Bis-Tag gehört dazu: die RPC schneidet bei `<`, also die Grenze des Folgetags.
      p_to: tagesgrenze(sp.bis, 1),
      p_limit: PRO_SEITE,
      p_offset: (seite - 1) * PRO_SEITE,
    }),
    supabase.rpc("mail_log_stats", { p_days: 90 }),
    supabase.rpc("mail_templates_admin"),
  ]);

  if (protokoll.error) {
    return (
      <>
        <PageHeader title={t.adminMailLog.title} description={t.adminMailLog.lead} />
        <MailTabs
          label={t.adminMailTemplates.title}
          log={t.adminMailTemplates.tabLog}
          templates={t.adminMailTemplates.tabTemplates}
        />
        <EmptyState title={t.adminMailLog.noAccessTitle} description={t.adminMailLog.noAccessBody} />
      </>
    );
  }

  const zeilen = (protokoll.data ?? []) as LogZeile[];
  const gesamt = zeilen[0]?.total ?? 0;

  // Was es im Protokoll nicht gibt, bietet der Filter nicht an.
  const statusOptionen: SelectOption[] = ((zahlen.data ?? []) as { status: string; anzahl: number }[])
    .map((s) => ({
      value: s.status,
      label: `${t.mailStatus[s.status as keyof typeof t.mailStatus] ?? s.status} (${s.anzahl})`,
    }));

  const schluessel = [...new Set(((vorlagen.data ?? []) as { key: string }[]).map((v) => v.key))].sort();
  const vorlagenOptionen: SelectOption[] = schluessel.map((k) => ({ value: k, label: k }));

  return (
    <>
      <PageHeader title={t.adminMailLog.title} description={t.adminMailLog.lead} />
      <MailTabs
        label={t.adminMailTemplates.title}
        log={t.adminMailTemplates.tabLog}
        templates={t.adminMailTemplates.tabTemplates}
      />

      <ProtokollView
        zeilen={zeilen}
        gesamt={gesamt}
        seite={seite}
        proSeite={PRO_SEITE}
        vorlagen={vorlagenOptionen}
        statusOptionen={statusOptionen}
        dateLocale={t.meta.dateLocale}
        t={t.adminMailLog}
        statusLabels={t.mailStatus}
        common={{ cancel: t.common.cancel, close: t.common.close, none: t.common.none }}
        rpcMessages={t.rpc}
      />

      <h2 className="ct-h2 mb-3 mt-8 text-ink">{t.admin.mail.title}</h2>
      <Card>
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
    </>
  );
}

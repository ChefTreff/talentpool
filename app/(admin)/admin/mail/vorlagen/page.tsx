import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { MailTabs } from "../MailTabs";
import { VorlagenView, type Vorlage } from "./VorlagenView";

export const dynamic = "force-dynamic";

/**
 * Mail-Vorlagen bearbeiten.
 *
 * `mail_templates_admin()` prüft `has_role('admin')` selbst — wer den
 * Admin-Bereich über eine andere Rolle betritt, sieht hier den Leerzustand und
 * keinen Fehler.
 */
export default async function MailVorlagenPage() {
  await requireArea("admin", "/admin/mail/vorlagen");
  const { t } = await getI18n("de");
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("mail_templates_admin");

  return (
    <>
      <PageHeader title={t.adminMailTemplates.title} description={t.adminMailTemplates.lead} />
      <MailTabs label={t.adminMailTemplates.title} log={t.adminMailTemplates.tabLog} templates={t.adminMailTemplates.tabTemplates} />
      {error ? (
        <EmptyState
          title={t.adminMailTemplates.noAccessTitle}
          description={t.adminMailTemplates.noAccessBody}
        />
      ) : (
        <VorlagenView
          vorlagen={(data ?? []) as Vorlage[]}
          dateLocale={t.meta.dateLocale}
          t={t.adminMailTemplates}
          common={{ cancel: t.common.cancel, save: t.common.save }}
          rpcMessages={t.rpc}
        />
      )}
    </>
  );
}

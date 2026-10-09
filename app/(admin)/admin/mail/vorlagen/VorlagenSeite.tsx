import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { mayEnterAdminSection } from "@/lib/admin-access";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import type { MailKategorie } from "@/lib/mail/kategorien";
import { MailTabs } from "../MailTabs";
import { VorlagenView } from "./VorlagenView";
import type { Vorlage } from "@/lib/mail/vorlagen";

/**
 * Die Vorlagenseite (ADM-102), gemeinsam für `/admin/mail/vorlagen` (alle Kategorien, die die Person bearbeiten darf,
 * mit Filter) und `/admin/mail/vorlagen/<bereich>` (eine feste Kategorie). Das Gate zieht die Seite davor — hier
 * wird nur geladen und angezeigt.
 *
 * `mail_templates_admin(p_category)` liefert **nur Vorlagen, die diese Person bearbeiten darf**, und je Vorlage beide
 * Sprachen; ohne Recht für irgendeine Kategorie ⇒ 42501 und der Leerzustand.
 */
export async function VorlagenSeite({
  kategorie,
  roleNames,
}: {
  kategorie: MailKategorie | null;
  roleNames: readonly string[];
}) {
  const { t, locale } = await getI18n("de");
  const supabase = await createSupabaseServerClient();
  const [{ data, error }, vocab, darfAlles] = await Promise.all([
    supabase.rpc("mail_templates_admin", { p_category: kategorie }),
    loadVocabMap(supabase, locale),
    // Protokoll, Testmail und die Kategorie einer Vorlage gehören dem Abschnitt `mail` (nur admin, Ausnahmen möglich).
    mayEnterAdminSection("mail", roleNames),
  ]);
  const kategorien = vgroup(vocab, "mail_category");
  const vorlagen = (data ?? []) as Vorlage[];

  return (
    <>
      <PageHeader word={t.admin.words.mail} title={t.adminMailTemplates.title} description={t.adminMailTemplates.lead} />
      <MailTabs
        label={t.adminMailTemplates.title}
        log={t.adminMailTemplates.tabLog}
        templates={t.adminMailTemplates.tabTemplates}
        mitProtokoll={darfAlles}
      />
      {error ? (
        <EmptyState title={t.adminMailTemplates.noAccessTitle} description={t.adminMailTemplates.noAccessBody} />
      ) : (
        <VorlagenView
          vorlagen={vorlagen}
          kategorien={kategorien}
          festeKategorie={kategorie}
          kannKategorie={darfAlles}
          dateLocale={t.meta.dateLocale}
          t={t.adminMailTemplates}
          common={{ cancel: t.common.cancel, save: t.common.save }}
          rpcMessages={t.rpc}
        />
      )}
    </>
  );
}

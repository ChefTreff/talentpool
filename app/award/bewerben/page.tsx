import { getI18n } from "@/lib/i18n";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadActiveKeys, loadVocabMap, vgroup } from "@/lib/vocab";
import { AppHeader } from "@/components/layout/AppHeader";
import { PortalFooter, DEFAULT_MAILBOX } from "@/components/layout/PortalFooter";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ButtonLink } from "@/components/ui/Button";
import { BewerbungsFormular } from "./BewerbungsFormular";

export const dynamic = "force-dynamic";

/**
 * Bewerbung zum Initiativen-Award (ADM-024), Felder nach dem Airtable-Formular
 * „FLS Initiativen Award". Ohne Login; abgeschickt wird an
 * `/api/award/bewerbung`. Ob die Bewerbung offen ist, sagt die Frist
 * `award_apply_until` der Edition.
 */
export default async function AwardBewerbenPage() {
  const { t, locale } = await getI18n();
  const a = t.award;
  const admin = createSupabaseAdminClient();
  const [{ data }, vocab, aktiv] = await Promise.all([
    admin.rpc("award_public_entries", { p_ip_hash: null }),
    loadVocabMap(admin, locale),
    loadActiveKeys(admin, "award_topic"),
  ]);
  const offen = Boolean(((data ?? []) as { apply_open: boolean }[])[0]?.apply_open);
  const themen = Object.entries(vgroup(vocab, "award_topic"))
    .filter(([k]) => aktiv.has(k))
    .map(([value, label]) => ({ value, label }));

  return (
    <>
      <AppHeader />
      <main id="content" className="flex flex-1 flex-col bg-canvas">
        <div className="mx-auto w-full max-w-form px-6 py-10">
          <PageHeader word={a.eyebrow} title={a.formTitle} description={a.formLead} />
          {offen ? (
            <BewerbungsFormular themen={themen} t={a.form} privacyLabel={t.common.privacy} />
          ) : (
            <EmptyState title={a.formClosedTitle} description={a.formClosedBody} action={<ButtonLink href="/award" variant="secondary">{a.toVoting}</ButtonLink>} />
          )}
          <div className="mt-10">
            <PortalFooter
              mailbox={DEFAULT_MAILBOX}
              mailboxLabel={t.common.supportMailbox}
              imprintLabel={t.common.imprint}
              privacyLabel={t.common.privacy}
            />
          </div>
        </div>
      </main>
    </>
  );
}

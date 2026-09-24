import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { VokabularView } from "./VokabularView";
import type { VocabTerm } from "./types";

export const dynamic = "force-dynamic";

/**
 * Vokabularpflege.
 *
 * Gelesen wird mit dem Nutzer-Client über `vocab_terms_admin()`, nicht mehr mit
 * `service_role` direkt auf der Tabelle: die Verwendungszahl je Begriff kommt
 * aus der Datenbank, und die Rechteprüfung gehört dorthin, wo die Daten sind.
 */
export default async function VokabularPage() {
  await requireAdminSection("vocab", "/admin/vokabular");
  const { t } = await getI18n("de");
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("vocab_terms_admin", { p_vocabulary: null });
  const terms = (data ?? []) as VocabTerm[];
  const vokabulare = new Set(terms.map((x) => x.vocabulary)).size;

  return (
    <>
      <PageHeader
        title={t.admin.vocab.title}
        description={`${terms.length} ${t.admin.vocab.count} ${vokabulare} ${t.admin.vocab.vocabularies}. ${t.adminVocab.lead}`}
      />
      {error ? (
        <EmptyState title={t.adminVocab.noAccessTitle} description={t.adminVocab.noAccessBody} />
      ) : (
        <VokabularView
          terms={terms}
          t={t.adminVocab}
          common={{
            save: t.common.save,
            cancel: t.common.cancel,
            delete: t.common.delete,
            active: t.common.active,
            inactive: t.common.inactive,
            none: t.common.none,
          }}
          rpcMessages={t.rpc}
        />
      )}
    </>
  );
}

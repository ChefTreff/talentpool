import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoeschenView } from "./LoeschenView";

export const dynamic = "force-dynamic";

/**
 * Profil löschen (Art. 17 DSGVO).
 *
 * Eigene Seite statt eines Knopfes unten im Formular: was hier passiert, ist
 * nicht rückgängig zu machen, und es braucht Platz für die Erklärung, was
 * „löschen" genau heisst.
 */
export default async function ProfilLoeschenPage() {
  await requireUser("/profil/loeschen");
  const { t } = await getI18n();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("my_deletion_status");
  const stand = (data ?? {}) as { blockers?: string[]; pending_since?: string | null };

  return (
    <div className="max-w-text">
      <PageHeader title={t.deleteProfile.title} description={t.deleteProfile.lead} />
      <LoeschenView
        blockers={error ? [] : (stand.blockers ?? [])}
        pendingSince={error ? null : (stand.pending_since ?? null)}
        dateLocale={t.meta.dateLocale}
        t={t.deleteProfile}
        blockerLabels={t.deletionBlockers}
        common={{ cancel: t.common.cancel }}
        rpcMessages={t.rpc}
      />
    </div>
  );
}

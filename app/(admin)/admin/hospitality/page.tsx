import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { HospitalityAdmin, type AdminQuota } from "./HospitalityAdmin";

export const dynamic = "force-dynamic";

export default async function AdminHospitalityPage() {
  await requireArea("admin", "/admin/hospitality");
  const { locale, t } = await getI18n();
  const supabase = await createSupabaseServerClient();

  const [{ data: rows }, { data: events }, vocab] = await Promise.all([
    supabase.rpc("hospitality_admin_overview"),
    supabase.from("event").select("id, name, slug, is_edition").eq("is_edition", true),
    loadVocabMap(supabase, locale),
  ]);

  const quotas = (rows ?? []) as AdminQuota[];
  const waiting = quotas.reduce((n, q) => n + q.waitlisted, 0);

  return (
    <>
      <PageHeader
        title={t.admin.hospitality.title}
        description={`${t.admin.hospitality.lead} · ${waiting} ${t.admin.hospitality.onWaitlist}`}
      />
      {quotas.length === 0 ? (
        <EmptyState
          title={t.admin.hospitality.emptyTitle}
          description={t.admin.hospitality.emptyBody}
        />
      ) : (
        <HospitalityAdmin
          quotas={quotas}
          editions={((events ?? []) as { id: string; name: string | null; slug: string }[]).map(
            (e) => ({ id: e.id, name: e.name ?? e.slug }),
          )}
          tiers={vgroup(vocab, "hotel_tier")}
          locale={locale}
          dateLocale={t.meta.dateLocale}
          t={t.admin.hospitality}
          // Die Feldnamen der Buchung stehen schon im Speaker-Portal; dieselbe
          // Buchung soll im Admin nicht anders heißen.
          detailLabels={t.speaker as unknown as Record<string, string>}
          common={{
            cancel: t.common.cancel,
            choose: t.common.choose,
            none: t.common.none,
            save: t.common.save,
          }}
          rpcMessages={t.rpc}
        />
      )}
    </>
  );
}

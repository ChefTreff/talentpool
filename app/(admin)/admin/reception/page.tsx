import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { ReceptionAdmin } from "./ReceptionAdmin";
import type { ReceptionRow } from "./types";

export const dynamic = "force-dynamic";

/**
 * Die Speaker Reception verwalten (SPK-003).
 *
 * Konrad am 17.09.: Funktionsumfang wie eine Luma-Event-Seite, Verwaltung bei
 * uns. Hier entstehen Zeit, Ort, Beschreibung und Obergrenze; angemeldet wird
 * im Speaker-Portal.
 */
export default async function AdminReceptionPage() {
  await requireArea("admin", "/admin/reception");
  const { t } = await getI18n();
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase.rpc("receptions_admin");

  return (
    <>
      <PageHeader title={t.admin.reception.title} description={t.admin.reception.lead} />
      <ReceptionAdmin
        rows={(data ?? []) as ReceptionRow[]}
        dateLocale={t.meta.dateLocale}
        t={t.admin.reception}
        common={{
          cancel: t.common.cancel,
          save: t.common.save,
          required: t.common.required,
        }}
        rpcMessages={t.rpc}
      />
    </>
  );
}

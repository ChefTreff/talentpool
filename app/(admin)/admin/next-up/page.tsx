import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { NextUpAdmin, type AdminNextUp } from "./NextUpAdmin";

export const dynamic = "force-dynamic";

/**
 * „Next Up" pflegen (TAL-006): die Hinweise auf kommende Events und
 * Programme, die jede angemeldete Person auf Home im Teilnehmer-Portal sieht.
 * Konrad, 24.09.: „ein super Marketing-Kanal" — deshalb Marketing und die
 * Talent-Leitung, nicht nur Admin.
 */
export default async function AdminNextUpPage() {
  await requireAdminSection("nextUp", "/admin/next-up");
  const { t } = await getI18n();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("next_up_items_admin");

  return (
    <>
      <PageHeader word={t.admin.words.nextUp} title={t.nextUpAdmin.title} description={t.nextUpAdmin.lead} />
      <NextUpAdmin
        items={(data ?? []) as AdminNextUp[]}
        now={new Date().getTime()}
        t={t.nextUpAdmin}
        common={{ save: t.common.save, cancel: t.common.cancel, delete: t.common.delete }}
        rpcMessages={t.rpc}
      />
    </>
  );
}

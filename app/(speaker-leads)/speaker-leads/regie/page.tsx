import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { Anweisungsliste } from "@/components/regie/Anweisungsliste";
import { loadAnweisungsSlots } from "@/components/regie/load";
import type { ManagerScope } from "../types";

export const dynamic = "force-dynamic";

const PATH = "/speaker-leads/regie";

/**
 * Regieanweisungen im Lead-Portal (LEAD-031): jeder Slot der eigenen Bühnen als
 * Liste, statt der Regieseite der Produktion mit Bühnen- und Tagesauswahl.
 *
 * **Die Sicht folgt der Rolle des Portals** — wie das Board (LEAD-016): wer
 * Bühnen als Stage Lead führt, sieht genau diese; wer keine eigene Bühne hat
 * (Team), sieht alle, an denen er Regie machen darf. Was jemand darf,
 * entscheidet weiter `can_edit_regie` in `lead_regie_slots`.
 */
export default async function LeadsRegiePage() {
  await requireArea("speaker-leads", PATH);
  const { t } = await getI18n("de");
  const supabase = await createSupabaseServerClient();
  const [{ data: scopeJson }, alle] = await Promise.all([
    supabase.rpc("my_manager_scope"),
    loadAnweisungsSlots(),
  ]);
  const scope = (scopeJson ?? null) as ManagerScope | null;
  const eigene = new Set((scope?.stages ?? []).map((s) => s.id));
  const slots = eigene.size > 0 ? alle.filter((s) => eigene.has(s.stage_id)) : alle;

  return (
    <>
      <PageHeader title={t.leads.regieListTitle} description={t.leads.regieListLead} />
      <Anweisungsliste
        slots={slots}
        timezone="Europe/Berlin"
        dateLocale={t.meta.dateLocale}
        t={t.leads}
        p={t.production}
        rpcMessages={t.rpc}
      />
    </>
  );
}

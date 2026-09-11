import { loadVocabMap, vgroup } from "@/lib/vocab";
import { EmptyState } from "@/components/ui/EmptyState";
import { partnerAdminShell } from "../shell";
import type { AdminAllocation } from "../types";
import { AllocationTable } from "./AllocationTable";

export const dynamic = "force-dynamic";

/** Kontingente pflegen und einzeln nach vivenu schieben. */
export default async function AdminAllocationsPage() {
  const shell = await partnerAdminShell("/admin/partner/kontingente");
  if (!shell.ok) return shell.view;
  const { supabase, t, locale, frame } = shell;

  const [{ data: rows }, vocab] = await Promise.all([
    supabase.rpc("ticket_allocations_admin"),
    loadVocabMap(supabase, locale),
  ]);
  const allocations = (rows ?? []) as AdminAllocation[];
  const pending = allocations.filter((a) => a.status === "pending_vivenu").length;

  return frame(
    t.adminPartner.allocationsTitle,
    `${t.adminPartner.allocationsLead} · ${allocations.length}` +
      (pending > 0 ? ` · ${pending} ${t.adminPartner.countPending}` : ""),
    allocations.length === 0 ? (
      <EmptyState
        title={t.adminPartner.allocationsEmptyTitle}
        description={t.adminPartner.allocationsEmptyBody}
      />
    ) : (
      <AllocationTable
        rows={allocations}
        passTypes={vgroup(vocab, "ticket_type")}
        dateLocale={t.meta.dateLocale}
        t={t.adminPartner}
        common={{ none: t.common.none, save: t.common.save }}
        rpcMessages={t.rpc}
      />
    ),
  );
}

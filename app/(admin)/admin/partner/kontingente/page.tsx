import { loadVocabMap, vgroup } from "@/lib/vocab";
import { EmptyState } from "@/components/ui/EmptyState";
import { partnerAdminShell } from "../shell";
import type { AdminAllocation, AdminTicketRequest, OrgEditionOption } from "../types";
import { AllocationTable } from "./AllocationTable";
import { ZusatzAnfragen } from "./ZusatzAnfragen";

export const dynamic = "force-dynamic";

/** Kontingente pflegen und einzeln nach vivenu schieben. */
export default async function AdminAllocationsPage() {
  const shell = await partnerAdminShell("/admin/partner/kontingente");
  if (!shell.ok) return shell.view;
  const { supabase, t, locale, frame } = shell;

  const [{ data: rows }, { data: orgRows }, { data: requestRows }, vocab] = await Promise.all([
    supabase.rpc("ticket_allocations_admin"),
    supabase.rpc("org_editions_picker"),
    // Zusatzanfragen aller Editionen, offene zuerst (PART-070). Ohne Editionsfilter,
    // weil die Tabelle darunter auch alle Editionen zeigt.
    supabase.rpc("ticket_requests_admin"),
    loadVocabMap(supabase, locale),
  ]);
  const requests = (requestRows ?? []) as AdminTicketRequest[];
  const allocations = (rows ?? []) as AdminAllocation[];
  const orgs = (orgRows ?? []) as OrgEditionOption[];
  const pending = allocations.filter((a) => a.status === "pending_vivenu").length;

  return frame(
    t.adminPartner.allocationsTitle,
    `${t.adminPartner.allocationsLead} · ${allocations.length}` +
      (pending > 0 ? ` · ${pending} ${t.adminPartner.countPending}` : ""),
    // Auch ohne Zeile bleibt die Maske stehen: das Rabattkontingent ist der Weg
    // zur ersten Zeile, ein reiner Leerzustand waere eine Sackgasse.
    <>
      {allocations.length === 0 && (
        <EmptyState
          title={t.adminPartner.allocationsEmptyTitle}
          description={t.adminPartner.allocationsEmptyBody}
        />
      )}
      {requests.length > 0 && (
        <ZusatzAnfragen
          rows={requests}
          passTypes={vgroup(vocab, "ticket_type")}
          dateLocale={t.meta.dateLocale}
          t={t.adminPartner}
          rpcMessages={t.rpc}
        />
      )}
      <AllocationTable
        rows={allocations}
        orgs={orgs}
        passTypes={vgroup(vocab, "ticket_type")}
        dateLocale={t.meta.dateLocale}
        t={t.adminPartner}
        common={{ none: t.common.none, save: t.common.save }}
        rpcMessages={t.rpc}
      />
    </>,
  );
}

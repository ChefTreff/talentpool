import { EmptyState } from "@/components/ui/EmptyState";
import { loadEditions, pickEdition } from "../editions";
import { partnerAdminShell } from "../shell";
import type { BoothDayRow, FreeBooth, OrgEditionOption } from "../types";
import { BoothPlan } from "./BoothPlan";

export const dynamic = "force-dynamic";

/**
 * Standbelegung je Tag (A3.5, Migration 0124). Ein Stand ohne Tag gilt für alle
 * Tage; zwei Organisationen können sich denselben Stand an verschiedenen Tagen
 * teilen. Die Oberfläche kam mit 0137 nach.
 *
 * Die Tage kommen aus `event_day` und nicht aus dem Plan: ohne sie liesse sich
 * keine Tagesbelegung anlegen, und ein leerer Plan sähe aus wie ein Fehler.
 */
export default async function AdminBoothsPage() {
  const shell = await partnerAdminShell("/admin/partner/staende");
  if (!shell.ok) return shell.view;
  const { supabase, t, frame } = shell;

  const edition = pickEdition(await loadEditions(supabase));
  const [{ data: planRows }, { data: freeRows }, { data: orgRows }, { data: dayRows }] =
    await Promise.all([
      supabase.rpc("booth_day_plan", { p_edition_id: edition?.id ?? null }),
      supabase.rpc("booths_free", { p_edition_id: edition?.id ?? null }),
      supabase.rpc("org_editions_picker", { p_edition_id: edition?.id ?? null }),
      supabase
        .from("event_day")
        .select("id,day_date,label_de")
        .eq("event_id", edition?.id ?? "")
        .order("day_date"),
    ]);

  const plan = (planRows ?? []) as BoothDayRow[];
  const free = (freeRows ?? []) as FreeBooth[];
  const orgs = (orgRows ?? []) as OrgEditionOption[];
  const days = ((dayRows ?? []) as { id: string; day_date: string; label_de: string | null }[]).map(
    (d) => ({ id: d.id, label: d.label_de ?? d.day_date }),
  );

  return frame(
    t.adminPartner.boothsTitle,
    `${t.adminPartner.boothsLead} · ${free.length} ${t.adminPartner.boothsFreeCount}`,
    days.length === 0 ? (
      <EmptyState
        title={t.adminPartner.boothsNoDaysTitle}
        description={t.adminPartner.boothsNoDaysBody}
      />
    ) : (
      <BoothPlan
        plan={plan}
        days={days}
        free={free}
        orgs={orgs}
        t={t.adminPartner}
        common={{ none: t.common.none, save: t.common.save }}
        rpcMessages={t.rpc}
      />
    ),
  );
}

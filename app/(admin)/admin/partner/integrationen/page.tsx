import { loadEditions } from "../editions";
import { partnerAdminShell } from "../shell";
import type { IngestLogRow } from "../types";
import { IntegrationsView } from "./IntegrationsView";

export const dynamic = "force-dynamic";

/** HubSpot, vivenu und Swapcard: Kennungen, Trockenläufe und das Protokoll. */
export default async function AdminIntegrationsPage() {
  const shell = await partnerAdminShell("/admin/partner/integrationen");
  if (!shell.ok) return shell.view;
  const { supabase, t, frame } = shell;

  const [editions, { data: log }] = await Promise.all([
    loadEditions(supabase),
    supabase.rpc("partner_ingest_log", { p_limit: 100 }),
  ]);
  const rows = (log ?? []) as IngestLogRow[];
  const openErrors = rows.filter((r) => r.kind === "sync_error" && !r.resolved).length;

  return frame(
    t.adminPartner.integrationsTitle,
    `${t.adminPartner.integrationsLead}` +
      (openErrors > 0 ? ` · ${openErrors} ${t.adminPartner.countOpenErrors}` : ""),
    <IntegrationsView
      editions={editions}
      log={rows}
      dateLocale={t.meta.dateLocale}
      t={t.adminPartner}
      common={{ cancel: t.common.cancel, none: t.common.none, save: t.common.save }}
      rpcMessages={t.rpc}
    />,
  );
}

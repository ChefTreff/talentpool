import { loadVocabMap, vgroup } from "@/lib/vocab";
import { loadEditions } from "../editions";
import { partnerAdminShell } from "../shell";
import type { IngestLogRow } from "../types";
import { IntegrationsView } from "./IntegrationsView";
import { ProductSyncCard } from "./ProductSyncCard";
import { SpeakerSyncCard } from "./SpeakerSyncCard";

export const dynamic = "force-dynamic";

/** HubSpot, vivenu und Swapcard: Kennungen, Trockenläufe und das Protokoll. */
export default async function AdminIntegrationsPage() {
  const shell = await partnerAdminShell("/admin/partner/integrationen");
  if (!shell.ok) return shell.view;
  const { supabase, t, locale, frame } = shell;

  const [editions, { data: log }, vocab] = await Promise.all([
    loadEditions(supabase),
    supabase.rpc("partner_ingest_log", { p_limit: 100 }),
    loadVocabMap(supabase, locale),
  ]);
  const rows = (log ?? []) as IngestLogRow[];
  const openErrors = rows.filter((r) => r.kind === "sync_error" && !r.resolved).length;

  return frame(
    t.adminPartner.integrationsTitle,
    `${t.adminPartner.integrationsLead}` +
      (openErrors > 0 ? ` · ${openErrors} ${t.adminPartner.countOpenErrors}` : ""),
    <>
      {/* Der Produktabgleich gehoert hierher und nicht auf eine eigene Seite:
          hier steht schon, was mit welchem Fremdsystem passiert ist (A4.3). */}
      <ProductSyncCard t={t.adminPartner} />
      <SpeakerSyncCard t={t.adminPartner} />
      <IntegrationsView
      editions={editions}
      log={rows}
      levels={vgroup(vocab, "sponsoring_level")}
      categories={vgroup(vocab, "product_category")}
      dateLocale={t.meta.dateLocale}
      t={t.adminPartner}
      common={{ cancel: t.common.cancel, none: t.common.none, save: t.common.save }}
      rpcMessages={t.rpc}
      />
    </>,
  );
}

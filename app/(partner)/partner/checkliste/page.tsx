import { notFound } from "next/navigation";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { getPartnerScope } from "../org";
import { canEditOnboarding, type Deliverable, type PartnerOverview } from "../types";
import { AbschnittsNavigation } from "@/components/ui/Abschnitte";
import { ChecklistView, type ChecklistGroup } from "./ChecklistView";
import { FristenListe, fristenAuswahl } from "../fristen";

export const dynamic = "force-dynamic";

/**
 * Die Checkliste entsteht ausschließlich aus gebuchten Leistungen — die
 * Trigger hinter `org_product` legen sie an, `my_deliverables` gibt sie
 * heraus. Diese Seite gruppiert und zeigt, sie erfindet nichts dazu.
 */
export default async function PartnerChecklistPage() {
  await requireArea("partner", "/partner/checkliste");
  const { locale, t } = await getI18n("de");
  const { current } = await getPartnerScope();
  if (!current) notFound();

  const supabase = await createSupabaseServerClient();
  const [{ data: rows }, { data: overviewJson }] = await Promise.all([
    supabase.rpc("my_deliverables", {
      p_org_id: current.org_id,
      p_edition_id: current.edition_id,
    }),
    supabase.rpc("partner_overview", {
      p_org_id: current.org_id,
      p_edition_id: current.edition_id,
    }),
  ]);
  const deliverables = (rows ?? []) as Deliverable[];
  const overview = (overviewJson ?? null) as PartnerOverview | null;
  if (!overview) notFound();

  // Gruppierung nach Leistung; was an keiner hängt, steht unter „Allgemeine Aufgaben".
  const groups: ChecklistGroup[] = [];
  const bySku = new Map<string | null, ChecklistGroup>();
  for (const d of [...deliverables].sort((a, b) => a.sort - b.sort || a.key.localeCompare(b.key))) {
    const sku = d.product_sku;
    let group = bySku.get(sku);
    if (!group) {
      group = {
        sku,
        label:
          sku === null
            ? t.partnerChecklist.groupGeneral
            : ((locale === "en" ? d.product_name_en : d.product_name_de) ??
              d.product_name_de ??
              sku),
        items: [],
      };
      bySku.set(sku, group);
      groups.push(group);
    }
    group.items.push(d);
  }
  // Allgemeines zuerst, danach die Leistungen in ihrer Reihenfolge.
  groups.sort((a, b) => (a.sku === null ? -1 : b.sku === null ? 1 : 0));

  const c = overview.checklist;
  // PART-057: „Alle Fristen“ auf der Übersicht führt hierher — also stehen sie hier auch.
  const { fristen, jetzt } = fristenAuswahl(overview.deadlines);
  const navigation = [
    ...(fristen.length > 0 ? [{ id: "fristen", label: t.partnerChecklist.deadlinesTitle }] : []),
    ...groups.map((g) => ({
      id: `g-${g.sku ?? "global"}`,
      label: g.sku === null ? t.partnerChecklist.groupGeneral : g.label,
    })),
  ];

  return (
    <>
      <PageHeader
        word={t.partner.wordPreparation}
        title={t.partnerChecklist.title}
        description={`${t.partnerChecklist.lead} · ${t.partner.checklistDone
          .replace("{done}", String(c.done))
          .replace("{total}", String(c.total))}`}
      />
      {/* QS-042: Fristen und Gruppen als Menü; unter zwei Einträgen zeigt es nichts. */}
      <AbschnittsNavigation label={t.common.onThisPage} items={navigation} />

      {fristen.length > 0 && (
        <section id="fristen" aria-labelledby="fristen-titel" className="mb-8 scroll-mt-20">
          <h2 id="fristen-titel" className="ct-h2 border-b pb-2 text-ink">
            {t.partnerChecklist.deadlinesTitle}
          </h2>
          <p className="ct-help mt-2 mb-3">{t.partnerChecklist.deadlinesLead}</p>
          <Card className="p-0">
            <FristenListe
              fristen={fristen}
              jetzt={jetzt}
              locale={locale}
              dateLocale={t.meta.dateLocale}
              overdueLabel={t.partner.deadlineOverdue}
            />
          </Card>
        </section>
      )}

      {deliverables.length === 0 ? (
        <EmptyState
          title={t.partnerChecklist.emptyTitle}
          description={t.partnerChecklist.emptyBody}
        />
      ) : (
        <>
          {/* PART-064: sonst wundert man sich, dass sich manche Punkte nicht anklicken lassen. */}
          <p className="ct-help mb-6 max-w-text">{t.partnerChecklist.autoHint}</p>
          <ChecklistView
            orgId={current.org_id}
            editionId={current.edition_id}
            groups={groups}
            booth={overview.booth}
            // Hochladen und einreichen dürfen dieselben Rollen wie die
            // Stammdatenpflege; die RPC prüft es noch einmal.
            canEdit={canEditOnboarding(overview.roles, overview.team)}
            locale={locale}
            dateLocale={t.meta.dateLocale}
            fristTexte={{
              label: t.partnerChecklist.deadlineLabel,
              days: t.partner.countdownDays,
              hours: t.partner.countdownHours,
              soon: t.partner.countdownSoon,
              passed: t.common.deadlinePassed,
              done: t.common.deadlineDone,
            }}
            t={t.partnerChecklist}
            rpcMessages={t.rpc}
          />
        </>
      )}
    </>
  );
}

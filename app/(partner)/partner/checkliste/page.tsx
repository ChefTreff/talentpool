import { notFound } from "next/navigation";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadFristVorlagen } from "@/lib/partner/vorlagen";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { ordneFristen, type Zeile } from "@/components/partner/fristen-aufgaben";
import { getPartnerScope } from "../org";
import { canEditOnboarding, type Deliverable, type PartnerOverview } from "../types";
import { AbschnittsNavigation } from "@/components/ui/Abschnitte";
import { ChecklistView, type ChecklistGroup } from "./ChecklistView";

export const dynamic = "force-dynamic";

/**
 * Die Checkliste entsteht ausschließlich aus gebuchten Leistungen — die
 * Trigger hinter `org_product` legen sie an, `my_deliverables` gibt sie
 * heraus. Diese Seite gruppiert und zeigt, sie erfindet nichts dazu.
 *
 * **Eine Liste für Aufgaben und Fristen** (PART-099): die Frist einer Aufgabe steht an ihr, und
 * eine Frist, an der keine Aufgabe dieses Partners hängt, steht als eigene Zeile unter den
 * allgemeinen Aufgaben. Es gibt keinen eigenen Abschnitt „Fristen“ mehr.
 */
export default async function PartnerChecklistPage() {
  await requireArea("partner", "/partner/checkliste");
  const { locale, t } = await getI18n("de");
  const { current } = await getPartnerScope();
  if (!current) notFound();

  const supabase = await createSupabaseServerClient();
  const [{ data: rows }, { data: overviewJson }, vorlagen] = await Promise.all([
    supabase.rpc("my_deliverables", {
      p_org_id: current.org_id,
      p_edition_id: current.edition_id,
    }),
    supabase.rpc("partner_overview", {
      p_org_id: current.org_id,
      p_edition_id: current.edition_id,
    }),
    loadFristVorlagen(supabase),
  ]);
  const deliverables = (rows ?? []) as Deliverable[];
  const overview = (overviewJson ?? null) as PartnerOverview | null;
  if (!overview) notFound();

  // Welche Aufgabe an welcher Frist hängt, und welche Fristen übrig bleiben.
  const { fristVon, ohneAufgabe } = ordneFristen(deliverables, overview.deadlines, vorlagen);

  // Gruppierung nach Leistung; was an keiner hängt, steht unter „Allgemeine Aufgaben".
  const groups: ChecklistGroup[] = [];
  const bySku = new Map<string | null, ChecklistGroup>();
  const gruppe = (sku: string | null, label: string) => {
    let group = bySku.get(sku);
    if (!group) {
      group = { sku, label, zeilen: [] };
      bySku.set(sku, group);
      groups.push(group);
    }
    return group;
  };
  for (const d of [...deliverables].sort((a, b) => a.sort - b.sort || a.key.localeCompare(b.key))) {
    const sku = d.product_sku;
    const group = gruppe(
      sku,
      sku === null
        ? t.partnerChecklist.groupGeneral
        : ((locale === "en" ? d.product_name_en : d.product_name_de) ?? d.product_name_de ?? sku),
    );
    group.zeilen.push({ art: "aufgabe", aufgabe: d });
  }
  // Fristen ohne Aufgabe gehören zu keiner Leistung: sie stehen hinter den allgemeinen Aufgaben,
  // nach Datum. Gibt es keine allgemeine Aufgabe, entsteht die Gruppe für sie.
  if (ohneAufgabe.length > 0) {
    const allgemein = gruppe(null, t.partnerChecklist.groupGeneral);
    allgemein.zeilen.push(...ohneAufgabe.map((frist): Zeile => ({ art: "frist", frist })));
  }
  // Allgemeines zuerst, danach die Leistungen in ihrer Reihenfolge.
  groups.sort((a, b) => (a.sku === null ? -1 : b.sku === null ? 1 : 0));

  const c = overview.checklist;
  const navigation = groups.map((g) => ({
    id: `g-${g.sku ?? "global"}`,
    label: g.sku === null ? t.partnerChecklist.groupGeneral : g.label,
  }));

  return (
    <>
      <PageHeader
        word={t.partner.wordPreparation}
        title={t.partnerChecklist.title}
        description={`${t.partnerChecklist.lead} · ${t.partner.checklistDone
          .replace("{done}", String(c.done))
          .replace("{total}", String(c.total))}`}
      />
      {/* QS-042: die Gruppen als Menü; unter zwei Einträgen zeigt es nichts. */}
      <AbschnittsNavigation label={t.common.onThisPage} items={navigation} />

      {groups.length === 0 ? (
        <EmptyState
          title={t.partnerChecklist.emptyTitle}
          description={t.partnerChecklist.emptyBody}
        />
      ) : (
        <>
          {/* PART-064: sonst wundert man sich, dass sich manche Punkte nicht anklicken lassen. */}
          {deliverables.length > 0 && <p className="ct-help mb-6 max-w-text">{t.partnerChecklist.autoHint}</p>}
          <ChecklistView
            orgId={current.org_id}
            editionId={current.edition_id}
            groups={groups}
            fristVon={fristVon}
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

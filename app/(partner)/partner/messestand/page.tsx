import { notFound } from "next/navigation";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { getPartnerScope } from "../org";
import { canEditOnboarding, type Deliverable, type PartnerOverview } from "../types";
import { Ausstattung } from "./Ausstattung";
import { Hallenplan } from "./Hallenplan";
import { Rueckwand } from "./Rueckwand";
import type { BoothPackage, EditionFile, Exhibitor } from "./types";

export const dynamic = "force-dynamic";

/** Der Schlüssel der Rückwand-Pflicht; dieselbe Zeile wie in der Checkliste. */
const BACKDROP_KEY = "backdrop_print";

/**
 * Messestand (F10). Im alten Portal war das die Seite, auf der die meisten
 * Rückfragen entstanden — Maße, Standnummer, Druckdatei, jedes Jahr dieselben.
 *
 * Vier Abschnitte in der Reihenfolge, in der die Fragen kommen: was ist das
 * hier, was ist in meinem Stand drin, was muss ich schicken, wo stehe ich.
 *
 * Nichts davon wird hier gepflegt: die Ausstattung kommt aus dem Produktmodell,
 * die Standnummer aus der Produktion, die Frist aus `deadline`. Die Seite
 * zeigt, sie erfindet nicht.
 */
export default async function MessestandPage() {
  await requireArea("partner", "/partner/messestand");
  const { locale, t } = await getI18n("de");
  const { current } = await getPartnerScope();
  if (!current) notFound();

  const supabase = await createSupabaseServerClient();
  const [
    { data: pkgRows },
    { data: overviewJson },
    { data: deliverableRows },
    { data: exhibitorRows },
    { data: fileRows },
    { data: deadlineRow },
  ] = await Promise.all([
    supabase.rpc("booth_packages"),
    supabase.rpc("partner_overview", {
      p_org_id: current.org_id,
      p_edition_id: current.edition_id,
    }),
    supabase.rpc("my_deliverables", {
      p_org_id: current.org_id,
      p_edition_id: current.edition_id,
    }),
    supabase.rpc("exhibitor_list", { p_edition_id: current.edition_id }),
    supabase.rpc("edition_files", { p_audience: "partner", p_edition_id: current.edition_id }),
    supabase
      .from("deadline")
      .select("due_at")
      .eq("edition_id", current.edition_id)
      .eq("key", "booth_changes_until")
      .maybeSingle(),
  ]);

  const overview = (overviewJson ?? null) as PartnerOverview | null;
  if (!overview) notFound();

  const packages = (pkgRows ?? []) as BoothPackage[];
  const deliverables = (deliverableRows ?? []) as Deliverable[];
  const exhibitors = (exhibitorRows ?? []) as Exhibitor[];
  const files = (fileRows ?? []) as EditionFile[];

  const backdrop = deliverables.find((d) => d.key === BACKDROP_KEY) ?? null;
  // Die Pflicht trägt das Datum als Kopie; die `deadline`-Zeile ist die
  // Wahrheit, falls noch keine Pflicht entstanden ist.
  const dueAt = backdrop?.due_at ?? deadlineRow?.due_at ?? null;

  const ownSkus = overview.products.map((p) => p.sku);
  const plan = files.find((f) => f.kind === "hallenplan") ?? null;
  // Der Bucket ist privat — ohne signierte URL zeigt der Browser nichts. Eine
  // Stunde reicht für einen Seitenbesuch und ist kurz genug, damit ein
  // weitergereichter Link nicht dauerhaft offen steht.
  const planUrl = plan
    ? ((await supabase.storage.from("edition-files").createSignedUrl(plan.storage_path, 3600)).data
        ?.signedUrl ?? null)
    : null;

  const b = t.partnerBooth;

  return (
    <>
      <PageHeader title={b.title} description={b.lead} />

      <div className="flex flex-col gap-10">
        <Card>
          <h2 className="ct-h3 text-ink">{b.introTitle}</h2>
          <p className="ct-small mt-1 leading-6">{b.introBody}</p>
        </Card>

        <section aria-labelledby="ausstattung">
          <div className="mb-2 flex flex-wrap items-baseline gap-2 border-b pb-2">
            <h2 id="ausstattung" className="ct-h3 text-ink">
              {b.equipTitle}
            </h2>
          </div>
          <p className="ct-small mb-3 leading-6">{b.equipBody}</p>
          {packages.length === 0 ? (
            <EmptyState title={b.equipEmptyTitle} description={b.equipEmptyBody} />
          ) : (
            <>
              <Ausstattung packages={packages} ownSkus={ownSkus} locale={locale} t={b} />
              <div className="mt-3">
                <ButtonLink href="/partner/shop" variant="secondary">
                  {b.equipToShop}
                </ButtonLink>
              </div>
            </>
          )}
        </section>

        <section aria-labelledby="rueckwand">
          <div className="mb-2 flex flex-wrap items-baseline gap-2 border-b pb-2">
            <h2 id="rueckwand" className="ct-h3 text-ink">
              {b.backTitle}
            </h2>
          </div>
          <Rueckwand
            orgId={current.org_id}
            editionId={current.edition_id}
            deliverable={backdrop}
            booth={overview.booth}
            dueAt={dueAt}
            canEdit={canEditOnboarding(overview.roles, overview.team)}
            dateLocale={t.meta.dateLocale}
            t={b}
            common={{ save: t.common.save, cancel: t.common.cancel }}
            rpcMessages={t.rpc}
          />
        </section>

        <section aria-labelledby="hallenplan">
          <div className="mb-2 flex flex-wrap items-baseline gap-2 border-b pb-2">
            <h2 id="hallenplan" className="ct-h3 text-ink">
              {b.planTitle}
            </h2>
          </div>
          <Hallenplan
            plan={plan}
            planUrl={planUrl}
            exhibitors={exhibitors}
            ownOrgId={current.org_id}
            ownBoothNumber={overview.booth?.booth_number ?? null}
            locale={locale}
            t={b}
          />
        </section>
      </div>
    </>
  );
}

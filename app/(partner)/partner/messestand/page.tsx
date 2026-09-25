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
import { AbschnittsNavigation } from "@/components/ui/Abschnitte";
import { FristMarke } from "@/components/ui/FristMarke";
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
 * Vier Abschnitte: was ist das hier, was muss ich schicken (die Rückwand steht
 * seit PART-084 oben — sie ist am wichtigsten), was ist in meinem Stand drin
 * (nur der gebuchte, PART-085), wo stehe ich.
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

  const ownSkus = new Set(overview.products.map((p) => p.sku));
  // PART-085: nur der gebuchte Stand; die übrigen Pakete sind für den Partner irrelevant.
  const eigenePakete = packages.filter((p) => ownSkus.has(p.sku));
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
      <PageHeader word={t.partner.wordPresence} title={b.title} description={b.lead} />
      {/* QS-042: die drei Arbeitsabschnitte als Menü. Die Einleitung darüber
          ist Lesestoff, kein Sprungziel. */}
      <AbschnittsNavigation
        label={t.common.onThisPage}
        items={[
          { id: "rueckwand", label: b.backTitle },
          { id: "ausstattung", label: b.equipTitle },
          { id: "hallenplan", label: b.planTitle },
        ]}
      />

      <div className="flex flex-col gap-10">
        <Card>
          <h2 className="ct-h2 text-ink">{b.introTitle}</h2>
          <p className="ct-small mt-1 leading-6">{b.introBody}</p>
        </Card>

        <section aria-labelledby="rueckwand">
          {/* Die Frist im Kopf des Abschnitts, rechts (QS-044). Europe/Berlin
              ausdrücklich: die Seite rendert auf dem Server, und der läuft in UTC. */}
          <div className="mb-2 flex flex-wrap items-end gap-3 border-b pb-2">
            <h2 id="rueckwand" className="ct-h2 scroll-mt-20 text-ink">
              {b.backTitle}
            </h2>
            {dueAt && (
              <FristMarke
                className="ml-auto"
                dueAt={dueAt}
                dateText={new Intl.DateTimeFormat(t.meta.dateLocale, {
                  dateStyle: "long",
                  timeStyle: "short",
                  timeZone: "Europe/Berlin",
                }).format(new Date(dueAt))}
                erledigt={backdrop?.status === "accepted"}
                t={{
                  label: b.dueOn,
                  days: b.countdownDays,
                  hours: b.countdownHours,
                  soon: b.countdownSoon,
                  passed: t.common.deadlinePassed,
                  done: t.common.deadlineDone,
                }}
              />
            )}
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
            common={{ save: t.common.save, cancel: t.common.cancel, upload: t.common.upload, chooseOtherFile: t.common.chooseOtherFile }}
            rpcMessages={t.rpc}
          />
        </section>

        <section aria-labelledby="ausstattung">
          <div className="mb-2 flex flex-wrap items-baseline gap-2 border-b pb-2">
            <h2 id="ausstattung" className="ct-h2 scroll-mt-20 text-ink">
              {b.equipTitle}
            </h2>
          </div>
          <p className="ct-small mb-3 leading-6">{b.equipBody}</p>
          {eigenePakete.length === 0 ? (
            <EmptyState title={b.equipNoneTitle} description={b.equipNoneBody} />
          ) : (
            <>
              <Ausstattung packages={eigenePakete} locale={locale} t={b} />
              {/* PART-087: der Hinweis vor dem Knopf sagt, wofür der Shop da ist. */}
              <p className="ct-small mt-3 leading-6">{b.equipShopHint}</p>
              <div className="mt-2">
                <ButtonLink href="/partner/shop" variant="secondary">
                  {b.equipToShop}
                </ButtonLink>
              </div>
            </>
          )}
        </section>

        <section aria-labelledby="hallenplan">
          <div className="mb-2 flex flex-wrap items-baseline gap-2 border-b pb-2">
            <h2 id="hallenplan" className="ct-h2 scroll-mt-20 text-ink">
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

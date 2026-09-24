import { notFound } from "next/navigation";
import Link from "next/link";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { DeadlineCard } from "@/components/ui/DeadlineCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { getPartnerScope } from "../org";
import { PflichtUpload } from "../PflichtUpload";
import { canEditOnboarding, type Deliverable, type PartnerOverview } from "../types";

export const dynamic = "force-dynamic";

/**
 * Branding (PART-043). Die Seite erscheint, sobald der Partner ein
 * Branding-Produkt gebucht hat (`product.format_key = 'branding'`).
 *
 * Sie zeigt zwei Dinge nebeneinander, die ein Partner sonst an zwei Orten
 * suchen müsste: **was er gebucht hat** und **was wir dafür von ihm brauchen**.
 * Die Dateien hängen an denselben Pflichten wie in der Checkliste — dieselbe
 * Datei, nicht eine zweite Ablage (PART-035).
 *
 * Nicht jedes Branding-Produkt braucht eine Datei: Ein Bodenaufkleber wird
 * produziert, eine Logoplatzierung nutzt das Logo aus dem Onboarding. Deshalb
 * sagt die Seite bei einem Produkt ohne Pflicht ausdrücklich, dass wir uns
 * melden — statt eine Leerstelle zu lassen, die wie ein Fehler aussieht.
 */
export default async function PartnerBrandingPage() {
  await requireArea("partner", "/partner/branding");
  const { locale, t } = await getI18n("de");
  const { current } = await getPartnerScope();
  if (!current) notFound();

  const supabase = await createSupabaseServerClient();
  const args = { p_org_id: current.org_id, p_edition_id: current.edition_id };
  const [{ data: overviewJson }, { data: deliverableRows }] = await Promise.all([
    supabase.rpc("partner_overview", args),
    supabase.rpc("my_deliverables", args),
  ]);

  const overview = (overviewJson ?? null) as PartnerOverview | null;
  const deliverables = (deliverableRows ?? []) as Deliverable[];
  const s = t.partnerBranding;
  const dateTime = new Intl.DateTimeFormat(t.meta.dateLocale, { dateStyle: "long", timeStyle: "short" });

  const gebucht = (overview?.products ?? []).filter((p) => p.format_key === "branding");
  const canEdit = overview ? canEditOnboarding(overview.roles, overview.team) : false;

  // Pflichten, die zu einem Branding-Produkt gehören. Die Zuordnung läuft über
  // die SKU der Pflicht, nicht über ihren Schlüssel: so zieht jedes neue
  // Branding-Produkt seine Pflicht mit, sobald das Team eine anlegt.
  const skus = new Set(gebucht.map((p) => p.sku));
  const pflichten = deliverables.filter((d) => d.product_sku && skus.has(d.product_sku));
  const ohnePflicht = gebucht.filter((p) => !pflichten.some((d) => d.product_sku === p.sku));

  const name = (p: { name_de: string | null; name_en: string | null; sku: string }) =>
    (locale === "en" ? p.name_en : p.name_de) ?? p.name_de ?? p.sku;

  return (
    <>
      <PageHeader word={t.partner.wordBrand} title={s.title} description={s.lead} />

      {gebucht.length === 0 ? (
        <EmptyState
          title={s.emptyTitle}
          description={s.emptyBody}
          action={
            <Link href="/partner/checkliste" className="ct-link">
              {s.toChecklist}
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {pflichten.map((d) => {
            const produkt = gebucht.find((p) => p.sku === d.product_sku);
            const abgelaufen = d.due_at !== null && new Date(d.due_at) < new Date();
            return (
              <Card key={d.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="ct-h3 text-ink">
                    {(locale === "en" ? d.label_en : d.label_de) ?? d.key}
                  </h2>
                  <Badge tone={d.status === "accepted" ? "success" : d.status === "rejected" ? "error" : "neutral"}>
                    {t.partner[`deliverable_${d.status}` as keyof typeof t.partner] as string}
                  </Badge>
                </div>
                {produkt && <p className="ct-help mt-1">{name(produkt)}</p>}
                {(locale === "en" ? d.description_en : d.description_de) && (
                  <p className="ct-small mt-2 leading-6">
                    {locale === "en" ? d.description_en : d.description_de}
                  </p>
                )}
                {d.due_at && (
                  <div className="mt-3">
                    <DeadlineCard
                      dueAt={d.due_at}
                      label={s.dueLabel}
                      dateText={dateTime.format(new Date(d.due_at))}
                      days={t.partner.countdownDays}
                      hours={t.partner.countdownHours}
                      soon={t.partner.countdownSoon}
                    />
                  </div>
                )}
                <div className="mt-4">
                  <PflichtUpload
                    orgId={current.org_id}
                    editionId={current.edition_id}
                    deliverable={d}
                    canEdit={canEdit}
                    locked={abgelaufen}
                    dateLocale={t.meta.dateLocale}
                    t={s}
                    rpcMessages={t.rpc}
                  />
                  {abgelaufen && <p className="ct-help mt-2">{s.pastDue}</p>}
                </div>
              </Card>
            );
          })}

          {ohnePflicht.length > 0 && (
            <Card>
              <h2 className="ct-h3 text-ink">{s.noFileTitle}</h2>
              <p className="ct-small mt-1 leading-6">{s.noFileBody}</p>
              <ul className="ct-help mt-3 flex flex-col gap-1">
                {ohnePflicht.map((p) => (
                  <li key={p.sku}>{name(p)}</li>
                ))}
              </ul>
            </Card>
          )}

          <p className="ct-help">{s.wikiHint}</p>
        </div>
      )}
    </>
  );
}

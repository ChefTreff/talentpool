import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ButtonDownload } from "@/components/ui/Button";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { zahl } from "@/lib/produktion/staende";
import { Herkunft } from "../Herkunft";
import { loadAxes, loadSuppliers } from "../load";

export const dynamic = "force-dynamic";

/**
 * Was die Edition bei welchem Dienstleister bestellt, summiert über alle
 * Stände — die Grundlage der Bestellung beim Messebauer. Seit PROD-004 steht
 * darin die Paketausstattung der gebuchten Stände, das direkt Gebuchte und der
 * Messeshop zusammen; die Spalte „Herkunft“ weist die drei Anteile aus. Ohne
 * Filter alles, mit `?dienstleister=` je Partner; der CSV-Link nimmt denselben
 * Filter mit.
 */
export default async function SupplierOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ dienstleister?: string }>;
}) {
  await requireAdminSection("productionOrders", "/admin/produktion/bestellungen");
  const { locale, t } = await getI18n("de");
  const { dienstleister } = await searchParams;
  const axes = await loadAxes();
  const rows = axes.editionId ? await loadSuppliers(axes.editionId, dienstleister) : [];
  const money = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" });
  const menge = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });

  return (
    <>
      <PageHeader word={t.admin.words.production} title={t.production.supplierTitle} description={t.production.supplierLead} />
      {rows.length === 0 ? (
        <EmptyState title={t.production.emptySuppliers} description={t.production.emptySuppliersBody} />
      ) : (
        <>
          <div className="mb-4">
            {/* Echter Download statt Seitenwechsel: ein Link lädt das Ziel vor und holte die CSV schon ohne
                Klick; die alte Adresse /produktion/… ging nur noch über die Weiterleitung. */}
            <ButtonDownload
              variant="secondary"
              href={`/admin/produktion/bestellungen/csv${dienstleister ? `?dienstleister=${encodeURIComponent(dienstleister)}` : ""}`}
            >
              {t.production.csv}
            </ButtonDownload>
          </div>
          <Table>
            <Thead>
              <Th>{t.production.colSupplier}</Th>
              <Th>{t.production.colProduct}</Th>
              <Th numeric>{t.production.colQty}</Th>
              <Th>{t.production.colSource}</Th>
              <Th numeric>{t.production.colOrgs}</Th>
              <Th numeric>{t.production.colPurchase}</Th>
            </Thead>
            <Tbody>
              {rows.map((r) => (
                <Tr key={`${r.supplier}-${r.product_sku}`}>
                  <Td className="text-muted">{r.supplier || "—"}</Td>
                  <Td>
                    <span className="ct-label">{r.product_name}</span>
                    <div className="ct-help">{r.product_sku}</div>
                  </Td>
                  <Td numeric className="tabular-nums">
                    {menge.format(zahl(r.qty))} {r.unit ?? ""}
                  </Td>
                  <Td>
                    <Herkunft q={r} t={t.production} locale={locale} />
                  </Td>
                  <Td numeric className="tabular-nums">{r.orgs}</Td>
                  <Td numeric className="tabular-nums">
                    {r.purchase_price_cents == null
                      ? "—"
                      : money.format((r.purchase_price_cents * zahl(r.qty)) / 100)}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </>
      )}
    </>
  );
}

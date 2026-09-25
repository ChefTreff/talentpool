import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ButtonLink } from "@/components/ui/Button";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { loadAxes, loadSuppliers } from "../load";

export const dynamic = "force-dynamic";

/**
 * Was die Edition bei welchem Dienstleister bestellt, summiert über alle
 * Stände — die Grundlage der Bestellung beim Messebauer. Ohne Filter alles,
 * mit `?dienstleister=` je Partner; der CSV-Link nimmt denselben Filter mit.
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

  return (
    <>
      <PageHeader word={t.admin.words.production} title={t.production.supplierTitle} description={t.production.supplierLead} />
      {rows.length === 0 ? (
        <EmptyState title={t.production.emptySuppliers} description={t.production.emptySuppliersBody} />
      ) : (
        <>
          <div className="mb-4">
            <ButtonLink
              variant="secondary"
              href={`/produktion/bestellungen/csv${dienstleister ? `?dienstleister=${encodeURIComponent(dienstleister)}` : ""}`}
            >
              {t.production.csv}
            </ButtonLink>
          </div>
          <Table>
            <Thead>
              <Th>{t.production.colSupplier}</Th>
              <Th>{t.production.colProduct}</Th>
              <Th numeric>{t.production.colQty}</Th>
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
                    {r.qty} {r.unit ?? ""}
                  </Td>
                  <Td numeric className="tabular-nums">{r.orgs}</Td>
                  <Td numeric className="tabular-nums">
                    {r.purchase_price_cents == null
                      ? "—"
                      : money.format((r.purchase_price_cents * Number(r.qty)) / 100)}
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

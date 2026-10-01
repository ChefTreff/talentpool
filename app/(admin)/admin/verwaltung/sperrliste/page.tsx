import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { SperrlisteFormulare } from "./SperrlisteFormulare";

export const dynamic = "force-dynamic";

/**
 * Die Sperrliste (ADM-035): Adressen, an die nichts mehr geht und die kein
 * Import zurückbringt — nach einer Löschung, einer Abmeldung oder einem harten
 * Bounce. `queue_mail` und die Importe prüfen sie bei jedem Schritt.
 *
 * **Die Liste kennt keine Adressen**, nur Hashes; das ist ihr Sinn. Deshalb
 * zeigt die Seite Zahlen je Grund und beantwortet die Frage für eine Adresse,
 * die jemand eingibt — eine Aufzählung gesperrter Adressen gibt es nicht.
 */
export default async function SperrlistePage() {
  await requireAdminSection("suppression", "/admin/verwaltung/sperrliste");
  const { t } = await getI18n("de");
  const s = t.suppressionAdmin as Record<string, string>;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("suppression_overview");
  const zeilen = (data ?? []) as { reason: string; entries: number; first_at: string; last_at: string }[];
  const gesamt = zeilen.reduce((n, z) => n + Number(z.entries), 0);
  const datum = new Intl.DateTimeFormat(t.meta.dateLocale, { dateStyle: "medium" });

  return (
    <>
      <PageHeader word={t.admin.words.suppression} title={s.title} description={s.lead} />
      <SperrlisteFormulare dateLocale={t.meta.dateLocale} t={s} common={{ required: t.common.required }} rpcMessages={t.rpc} />
      <Card className="mt-6">
        <CardHeader ebene="h2" title={s.overviewTitle} description={s.count.replace("{n}", String(gesamt))} />
        {error ? (
          <EmptyState title={s.errorTitle} description={s.errorBody} />
        ) : zeilen.length === 0 ? (
          <p className="ct-small text-muted">{s.empty}</p>
        ) : (
          <Table>
            <Thead>
              <Th>{s.colReason}</Th>
              <Th>{s.colEntries}</Th>
              <Th>{s.colFirst}</Th>
              <Th>{s.colLast}</Th>
            </Thead>
            <Tbody>
              {zeilen.map((z) => (
                <Tr key={z.reason}>
                  <Td>{s[`reason_${z.reason}`] ?? z.reason}</Td>
                  <Td className="tabular-nums">{z.entries}</Td>
                  <Td className="text-muted tabular-nums">{datum.format(new Date(z.first_at))}</Td>
                  <Td className="text-muted tabular-nums">{datum.format(new Date(z.last_at))}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>
    </>
  );
}

import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { SperrlisteFormulare } from "./SperrlisteFormulare";

/**
 * Die Sperrliste (ADM-035) als Abschnitt der Seite „Löschanträge und Sperrliste“ (ADM-097): Adressen, an die nichts mehr
 * geht und die kein Import zurückbringt — nach einer Löschung, einer Abmeldung oder einem harten Bounce. `queue_mail` und
 * die Importe prüfen sie bei jedem Schritt.
 *
 * **Die Liste kennt keine Adressen**, nur Hashes; das ist ihr Sinn. Deshalb zeigt der Abschnitt Zahlen je Grund und
 * beantwortet die Frage für eine Adresse, die jemand eingibt — eine Aufzählung gesperrter Adressen gibt es nicht.
 *
 * Kein eigenes Gate: die Seite hat den Abschnitt `suppression` geprüft, bevor sie dies zeigt; die Aktionen
 * (`sperrliste/actions.ts`) prüfen ihn erneut.
 */
export async function SperrlisteAbschnitt() {
  const { t } = await getI18n("de");
  const s = t.suppressionAdmin as Record<string, string>;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("suppression_overview");
  const zeilen = (data ?? []) as { reason: string; entries: number; first_at: string; last_at: string }[];
  const gesamt = zeilen.reduce((n, z) => n + Number(z.entries), 0);
  const datum = new Intl.DateTimeFormat(t.meta.dateLocale, { dateStyle: "medium" });

  return (
    <>
      <p className="ct-small mb-6 max-w-prose text-muted">{s.lead}</p>
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

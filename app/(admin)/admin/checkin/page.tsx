import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SuchFeld } from "@/components/ui/SuchFeld";
import { Button } from "@/components/ui/Button";
import Link from "next/link";
import { toRpcFailure } from "@/lib/rpc-error";

export const dynamic = "force-dynamic";

type Tag = {
  tag: string; label: string | null;
  ok: number; duplicate: number; invalid: number; blocked: number;
  geraete: number; erster: string | null; letzter: string | null;
};
type Treffer = {
  ticket_id: string; holder: string | null; email: string | null; pass_type: string | null;
  status: string; barcode: string | null; scans: number;
  letzter_scan: string | null; letztes_ergebnis: string | null;
};

const ZEIT = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" });
const DATUM = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });

/**
 * Check-in im Admin (ADM-051).
 *
 * Bis hierher gab es den Einlass nur als Kiosk: Niemand ausserhalb des Geräts
 * sah, was passiert. Diese Seite beantwortet die zwei Fragen, die im Betrieb
 * gestellt werden — „wie viele sind drin?" und „was ist mit **diesem** Ticket?".
 *
 * **Unbekannte Barcodes stehen hier nicht**, weil sie nirgends stehen: die
 * Datenbank speichert sie bewusst nicht (0071). Eine Spalte mit einer
 * erfundenen Null wäre schlimmer als keine Spalte.
 *
 * Die Suche läuft über die Adresszeile statt über Zustand im Browser: so lässt
 * sich ein Treffer weiterschicken, und der CSV-Knopf nimmt dieselbe Frage mit.
 */
export default async function CheckinAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdminSection("checkin", "/admin/checkin");
  const { t } = await getI18n("de");
  const { q } = await searchParams;
  const suche = (q ?? "").trim();
  const supabase = await createSupabaseServerClient();

  const [tage, treffer] = await Promise.all([
    supabase.rpc("checkin_admin_days"),
    suche ? supabase.rpc("checkin_admin_search", { p_query: suche }) : Promise.resolve({ data: null, error: null }),
  ]);
  const rpc = t.rpc as Record<string, string>;
  const tx = t.checkinAdmin as Record<string, string>;
  const suchFehler = treffer.error ? (rpc[toRpcFailure(treffer.error).key] ?? rpc.unknown) : null;
  const zeilen = (treffer.data ?? []) as Treffer[];

  return (
    <>
      <PageHeader word={t.admin.words.checkin} title={t.checkinAdmin.title} description={t.checkinAdmin.lead} />

      <form className="mb-6 flex flex-wrap items-end gap-2" action="/admin/checkin">
        <label className="flex-1 min-w-64">
          <span className="ct-label mb-1 block text-ink">{t.checkinAdmin.searchLabel}</span>
          <SuchFeld name="q" defaultValue={suche} placeholder={t.checkinAdmin.searchPlaceholder} />
        </label>
        <Button type="submit" size="sm">{t.checkinAdmin.search}</Button>
        {suche && (
          <Link className="ct-link ct-small" href={`/admin/checkin/csv?q=${encodeURIComponent(suche)}`}>
            {t.checkinAdmin.csv}
          </Link>
        )}
      </form>

      {suchFehler && (
        <p role="alert" className="mb-4 rounded-ct-md border border-error-soft bg-error-soft p-3 ct-small text-error-ink">
          {suchFehler}
        </p>
      )}

      {suche && !suchFehler && (
        <section className="mb-8 flex flex-col gap-2">
          <h2 className="ct-h3 text-ink">{t.checkinAdmin.resultsTitle.replace("{n}", String(zeilen.length))}</h2>
          {zeilen.length === 0 ? (
            <EmptyState title={t.checkinAdmin.noHit} description={t.checkinAdmin.noHitBody} />
          ) : (
            <Card>
              <ul className="flex flex-col divide-y">
                {zeilen.map((z) => (
                  <li key={z.ticket_id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3">
                    <span className="ct-label text-ink">{z.holder ?? "—"}</span>
                    {z.email && <span className="ct-help">{z.email}</span>}
                    {z.pass_type && <span className="ct-help">{z.pass_type}</span>}
                    <span className="ml-auto flex flex-wrap items-center gap-2">
                      <Badge tone={z.status === "valid" || z.status === "checked_in" ? "success" : "warning"}>
                        {tx[`status_${z.status}`] ?? z.status}
                      </Badge>
                      <span className="ct-help">
                        {t.checkinAdmin.scans.replace("{n}", String(z.scans))}
                        {z.letzter_scan && ` · ${ZEIT.format(new Date(z.letzter_scan))}`}
                        {z.letztes_ergebnis && ` · ${tx[`result_${z.letztes_ergebnis}`] ?? z.letztes_ergebnis}`}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="ct-h3 text-ink">{t.checkinAdmin.daysTitle}</h2>
        <p className="ct-help">{t.checkinAdmin.daysHint}</p>
        <Card>
          <ul className="flex flex-col divide-y">
            {((tage.data ?? []) as Tag[]).map((d) => (
              <li key={d.tag} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3">
                <span className="ct-label text-ink">{DATUM.format(new Date(d.tag))}</span>
                {d.label && <span className="ct-help">{d.label}</span>}
                <span className="ml-auto flex flex-wrap items-center gap-2">
                  <Badge tone={d.ok > 0 ? "success" : "neutral"}>{t.checkinAdmin.in.replace("{n}", String(d.ok))}</Badge>
                  {d.duplicate > 0 && <Badge tone="neutral">{t.checkinAdmin.dup.replace("{n}", String(d.duplicate))}</Badge>}
                  {d.invalid + d.blocked > 0 && (
                    <Badge tone="warning">{t.checkinAdmin.rejected.replace("{n}", String(d.invalid + d.blocked))}</Badge>
                  )}
                  <span className="ct-help">
                    {d.geraete > 0 && t.checkinAdmin.devices.replace("{n}", String(d.geraete))}
                    {d.erster && d.letzter && ` · ${ZEIT.format(new Date(d.erster))}–${ZEIT.format(new Date(d.letzter))}`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </section>
    </>
  );
}

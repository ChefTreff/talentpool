"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { ButtonDownload } from "@/components/ui/Button";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { pruefZaehler, zahl } from "@/lib/produktion/staende";
import { setBoothCheck } from "./actions";
import { Herkunft } from "./Herkunft";
import { Pruefung } from "./Pruefung";
import type { BoothItem, BoothSummary } from "./types";

type Strings = Record<string, string>;

/**
 * Produktionsliste je Stand (PROD-004) mit interner Prüfung (PROD-005):
 * Paketausstattung, direkt Gebuchtes und Messeshop, Position für Position,
 * abgehakt bei der Anlieferung.
 *
 * Gruppiert nach Stand, weil der Aufbau so läuft: man steht vor einem Stand
 * und geht die Liste durch. Der Fortschritt steht je Stand in der Überschrift,
 * damit sichtbar ist, wo noch etwas fehlt, ohne jede Zeile zu lesen. Über der
 * Liste stehen die Zahlen der Prüfung; die Prüfpunkte je Stand sitzen vor den
 * Positionen, weil sie sagen, ob man der Liste trauen kann.
 */
export function BoothChecklist({
  items,
  stands,
  locale,
  t,
  rpcMessages,
}: {
  items: BoothItem[];
  stands: BoothSummary[];
  locale: string;
  t: Strings;
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" });
  const zahlenFormat = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });

  if (stands.length === 0 && items.length === 0) {
    return <EmptyState title={t.emptyBooths} description={t.emptyBoothsBody} />;
  }

  const byOrg = new Map<string, BoothItem[]>();
  for (const i of items) byOrg.set(i.org_edition_id, [...(byOrg.get(i.org_edition_id) ?? []), i]);
  // Die Stände kommen aus der Zusammenfassung; was dort fehlt, aber Positionen hat, steht trotzdem da.
  const bekannt = new Set(stands.map((s) => s.org_edition_id));
  const nachgetragen: BoothSummary[] = [...byOrg.entries()]
    .filter(([oe]) => !bekannt.has(oe))
    .map(([oe, rows]) => ({
      org_edition_id: oe,
      org_id: rows[0].org_id,
      org_name: rows[0].org_name,
      booth_number: rows[0].booth_number,
      booth_length_m: null,
      booth_width_m: null,
      stand_sqm: null,
      stand_days: null,
      package_names: null,
      reviews: [],
    }));
  const alle = [...stands, ...nachgetragen];
  const z = pruefZaehler(alle);

  function toggle(item: BoothItem, checked: boolean) {
    startTransition(async () => {
      const res = await setBoothCheck({
        orgEditionId: item.org_edition_id,
        sku: item.product_sku,
        checked,
      });
      if (!res.ok) {
        toast("error", message(res.key ?? "unknown"));
        return;
      }
      router.refresh();
    });
  }

  /** „9 qm gebucht · 2 Tage · Stand 3 × 3 m“ — was bekannt ist, in dieser Reihenfolge. */
  function groesse(s: BoothSummary): string {
    const teile: string[] = [];
    if (s.package_names) teile.push(s.package_names);
    if (s.stand_sqm != null) teile.push(t.sizeSqm.replace("{n}", zahlenFormat.format(zahl(s.stand_sqm))));
    if (s.stand_days != null) {
      teile.push(s.stand_days === 1 ? t.sizeDaysOne : t.sizeDays.replace("{n}", String(s.stand_days)));
    }
    if (s.booth_length_m != null && s.booth_width_m != null) {
      teile.push(
        t.sizeBooth
          .replace("{l}", zahlenFormat.format(zahl(s.booth_length_m)))
          .replace("{w}", zahlenFormat.format(zahl(s.booth_width_m))),
      );
    }
    return teile.length > 0 ? teile.join(" · ") : t.sizeUnknown;
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center gap-3">
        <p className="ct-help tabular-nums">
          {t.summaryLine
            .replace("{staende}", String(z.staende))
            .replace("{offen}", String(z.offen))
            .replace("{ok}", String(z.ok))
            .replace("{problem}", String(z.problem))
            .replace("{veraltet}", String(z.veraltet))}
        </p>
        <ButtonDownload variant="secondary" size="sm" className="ml-auto" href="/admin/produktion/staende/csv">
          {t.csvAll}
        </ButtonDownload>
      </div>

      {alle.map((s) => {
        const rows = byOrg.get(s.org_edition_id) ?? [];
        const done = rows.filter((r) => r.checked).length;
        return (
          <section key={s.org_edition_id} id={`stand-${s.org_edition_id}`} className="flex flex-col gap-2 scroll-mt-20">
            <div className="flex flex-wrap items-baseline gap-3">
              <h2 className="ct-h3">{s.org_name}</h2>
              {s.booth_number && <Badge>{s.booth_number}</Badge>}
              {rows.length > 0 && (
                <span className="ct-help tabular-nums">
                  {t.progress.replace("{done}", String(done)).replace("{total}", String(rows.length))}
                </span>
              )}
              {rows.length > 0 && (
                <ButtonDownload
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  href={`/admin/produktion/staende/csv?stand=${encodeURIComponent(s.org_edition_id)}`}
                >
                  {t.csv}
                </ButtonDownload>
              )}
            </div>
            <p className="ct-help">{groesse(s)}</p>

            {s.reviews.length > 0 && (
              <div className="divide-y rounded-ct-lg border bg-surface px-4" role="group" aria-label={t.reviewTitle}>
                {s.reviews.map((r) => (
                  <Pruefung
                    key={r.item_key}
                    orgEditionId={s.org_edition_id}
                    review={r}
                    locale={locale}
                    t={t}
                    rpcMessages={rpcMessages}
                  />
                ))}
              </div>
            )}

            {rows.length === 0 ? (
              <p className="ct-help">{t.emptyStand}</p>
            ) : (
              <Table>
                <Thead>
                  {/* Der Haken steht vorn: am Stand und auf dem Handy liegt die Arbeit links, nicht hinter dem Scrollen. */}
                  <Th>{t.colChecked}</Th>
                  <Th>{t.colProduct}</Th>
                  <Th numeric>{t.colQty}</Th>
                  <Th>{t.colSource}</Th>
                  <Th>{t.colSupplier}</Th>
                </Thead>
                <Tbody>
                  {rows.map((r) => (
                    <Tr key={r.product_sku} controls>
                      <Td>
                        <label className="-m-2 flex h-11 w-11 cursor-pointer items-center justify-center">
                          <input
                            type="checkbox"
                            className="h-5 w-5"
                            aria-label={`${t.colChecked}: ${r.product_name}`}
                            checked={r.checked}
                            disabled={pending}
                            onChange={(e) => toggle(r, e.target.checked)}
                          />
                        </label>
                      </Td>
                      <Td className="min-w-40">
                        <span className="ct-label">{r.product_name}</span>
                        <div className="ct-help">
                          {r.product_sku}
                          {r.checked && r.checked_at
                            ? ` · ${t.checkedBy
                                .replace("{name}", r.checked_by_name ?? "—")
                                .replace("{time}", dateTime.format(new Date(r.checked_at)))}`
                            : ""}
                        </div>
                      </Td>
                      <Td numeric className="tabular-nums">{zahlenFormat.format(zahl(r.qty))}</Td>
                      <Td>
                        <Herkunft q={r} t={t} locale={locale} />
                      </Td>
                      <Td className="text-muted">{r.supplier ?? "—"}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </section>
        );
      })}
    </div>
  );
}

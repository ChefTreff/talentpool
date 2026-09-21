import Image from "next/image";
import type { Locale } from "@/lib/i18n/shared";
import { Card } from "@/components/ui/Card";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import type { EditionFile, Exhibitor } from "./types";

type Strings = Record<string, string>;

/**
 * Hallenplan und Ausstellerliste.
 *
 * Beides kommt aus der Produktion und ist zum Zeitpunkt des Baus noch nicht da
 * — deshalb sagen die Leerzustände, **wann** es kommt, statt nur „keine Daten".
 * Das ist der Unterschied zwischen einer Seite, die kaputt wirkt, und einer,
 * die erklärt.
 *
 * Die Ausstellerliste enthält keine Personen und keine Logos. Logos lägen im
 * Partner-Bucket, dessen Policy je Organisation greift; sie quer lesbar zu
 * machen, wäre ein Loch im Bucket für eine Verzierung.
 */
export function Hallenplan({
  plan,
  planUrl,
  exhibitors,
  ownOrgId,
  ownBoothNumber,
  locale,
  t,
}: {
  plan: EditionFile | null;
  /** Signierte URL, serverseitig erzeugt — der Bucket ist privat. */
  planUrl: string | null;
  exhibitors: Exhibitor[];
  ownOrgId: string;
  ownBoothNumber: string | null;
  locale: Locale;
  t: Strings;
}) {
  const istBild = plan?.mime?.startsWith("image/") ?? false;
  const paket = (e: Exhibitor) =>
    (locale === "en" ? e.package_name_en : e.package_name_de) ?? e.package_name_de;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <p className="ct-eyebrow text-muted">{t.yourBooth}</p>
        <p className="ct-h2 mt-1 text-ink tabular-nums">{ownBoothNumber ?? t.boothSoon}</p>
        <p className="ct-small mt-2 leading-6">{t.planBody}</p>
      </Card>

      {plan && planUrl ? (
        <Card>
          {istBild ? (
            // `unoptimized`: die URL ist signiert und läuft ab — durch den
            // Bildoptimierer gereicht, würde sie zwischengespeichert und wäre
            // nach Ablauf tot.
            <Image
              src={planUrl}
              alt={(locale === "en" ? plan.label_en : plan.label_de) ?? plan.filename}
              width={1600}
              height={1000}
              unoptimized
              className="h-auto w-full rounded-ct-sm border"
            />
          ) : (
            <p className="ct-small leading-6">{plan.filename}</p>
          )}
          <div className="mt-3">
            <ButtonLink href={planUrl} target="_blank" rel="noreferrer noopener" variant="secondary">
              {t.planOpen}
            </ButtonLink>
          </div>
        </Card>
      ) : (
        <Card>
          <p className="ct-small leading-6 text-muted">{t.planNone}</p>
        </Card>
      )}

      <section aria-labelledby="aussteller">
        <div className="mb-2 flex flex-wrap items-baseline gap-2 border-b pb-2">
          <h3 id="aussteller" className="ct-h3 text-ink">
            {t.exhibitors}
          </h3>
          {exhibitors.length > 0 && (
            <span className="ct-help ml-auto tabular-nums">{exhibitors.length}</span>
          )}
        </div>
        {exhibitors.length === 0 ? (
          <EmptyState title={t.exhibitors} description={t.exhibitorsSoon} />
        ) : (
          <Card className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-120 border-collapse">
                <thead>
                  <tr className="border-b">
                    <th scope="col" className="ct-label w-30 px-4 py-2.5 text-left text-muted">
                      {t.colBooth}
                    </th>
                    <th scope="col" className="ct-label px-4 py-2.5 text-left text-muted">
                      {t.colExhibitor}
                    </th>
                    <th scope="col" className="ct-label px-4 py-2.5 text-left text-muted">
                      {t.colType}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {exhibitors.map((e) => {
                    const meins = e.org_id === ownOrgId;
                    return (
                      <tr
                        key={e.org_id}
                        className={
                          "border-b border-l-2 last:border-b-0 " +
                          (meins ? "border-l-accent bg-accent-soft/40" : "border-l-transparent")
                        }
                      >
                        <td className="ct-small px-4 py-2.5 tabular-nums text-ink">
                          {e.booth_number}
                        </td>
                        <td className={meins ? "ct-label px-4 py-2.5 text-ink" : "ct-small px-4 py-2.5 text-ink"}>
                          {e.name}
                        </td>
                        <td className="ct-small px-4 py-2.5 text-muted">
                          {paket(e) ?? e.booth_type ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>
    </div>
  );
}

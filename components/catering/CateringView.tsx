import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

type Strings = Record<string, string>;

export type CateringRow = { audience: string; diet: string; anzahl: number };
export type CateringNote = { audience: string; diet: string; note: string | null };
export type CateringCoverage = { audience: string; gesamt: number; mit_angabe: number };

/**
 * Die Catering-Übersicht — **ohne Namen**.
 *
 * Das ist keine Nachlässigkeit, sondern der Kern: der Freitext kann eine
 * Gesundheitsangabe sein (Art. 9 DSGVO). Es gibt in der Datenbank keine RPC,
 * die Angabe und Person zusammen herausgibt (Migration 0100) — diese Seite
 * könnte den Namen also gar nicht anzeigen, selbst wenn jemand ihn wollte.
 *
 * Gezeigt wird, was zum Bestellen nötig ist: Zahlen je Gruppe und
 * Ernährungsform, darunter die Hinweise als Liste. „Keine Angabe" steht
 * ausdrücklich mit da — wer bestellt, muss wissen, für wie viele Menschen er
 * nichts weiss.
 */
export function CateringView({
  summary,
  notes,
  coverage,
  dietLabels,
  audienceLabels,
  t,
  showCoverage = false,
}: {
  summary: CateringRow[];
  notes: CateringNote[];
  coverage: CateringCoverage[];
  dietLabels: Record<string, string>;
  audienceLabels: Record<string, string>;
  t: Strings;
  /** Im Admin zusätzlich: wie viele haben überhaupt geantwortet? */
  showCoverage?: boolean;
}) {
  const gruppen = [...new Set(summary.map((r) => r.audience))].sort();
  const dietLabel = (key: string) =>
    key === "keine_angabe" ? t.noAnswer : (dietLabels[key] ?? key);
  const gesamt = summary.reduce((n, r) => n + r.anzahl, 0);

  if (gesamt === 0) {
    return <EmptyState title={t.emptyTitle} description={t.emptyBody} />;
  }

  return (
    <div className="flex flex-col gap-6">
      {showCoverage && coverage.length > 0 && (
        <Card>
          <h2 className="ct-h3 text-ink">{t.coverageTitle}</h2>
          <p className="ct-small mt-1 leading-6">{t.coverageBody}</p>
          <ul className="mt-3 flex flex-wrap gap-6">
            {coverage.map((c) => (
              <li key={c.audience}>
                <span className="ct-eyebrow text-muted">
                  {audienceLabels[c.audience] ?? c.audience}
                </span>
                <span className="ct-h2 mt-1 block text-ink tabular-nums">
                  {c.mit_angabe} / {c.gesamt}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {gruppen.map((gruppe) => {
        const zeilen = summary
          .filter((r) => r.audience === gruppe)
          .sort((a, b) => b.anzahl - a.anzahl);
        const summe = zeilen.reduce((n, r) => n + r.anzahl, 0);
        return (
          <section key={gruppe} aria-labelledby={`g-${gruppe}`}>
            <div className="mb-2 flex flex-wrap items-baseline gap-2 border-b pb-2">
              <h2 id={`g-${gruppe}`} className="ct-h3 text-ink">
                {audienceLabels[gruppe] ?? gruppe}
              </h2>
              <span className="ct-help ml-auto tabular-nums">
                {t.total.replace("{n}", String(summe))}
              </span>
            </div>
            <Card className="p-0">
              <ul className="flex flex-col">
                {zeilen.map((r) => (
                  <li
                    key={r.diet}
                    className="flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0"
                  >
                    <span
                      className={
                        r.diet === "keine_angabe"
                          ? "ct-small min-w-0 flex-1 text-muted"
                          : "ct-label min-w-0 flex-1 text-ink"
                      }
                    >
                      {dietLabel(r.diet)}
                    </span>
                    <span className="ct-h3 shrink-0 tabular-nums text-ink">{r.anzahl}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        );
      })}

      <section aria-labelledby="hinweise">
        <div className="mb-2 flex flex-wrap items-baseline gap-2 border-b pb-2">
          <h2 id="hinweise" className="ct-h3 text-ink">
            {t.notesTitle}
          </h2>
          <span className="ct-help ml-auto tabular-nums">{notes.length}</span>
        </div>
        <p className="ct-small mb-3 leading-6">{t.notesBody}</p>
        {notes.length === 0 ? (
          <Card>
            <p className="ct-help">{t.notesEmpty}</p>
          </Card>
        ) : (
          <Card className="p-0">
            <ul className="flex flex-col">
              {notes.map((n, i) => (
                <li
                  key={`${n.audience}-${i}`}
                  className="flex flex-wrap items-baseline gap-3 border-b px-4 py-2.5 last:border-b-0"
                >
                  <span className="ct-help w-[110px] shrink-0">
                    {audienceLabels[n.audience] ?? n.audience}
                  </span>
                  <span className="ct-small min-w-0 flex-1 text-ink">{n.note}</span>
                  <span className="ct-help">{dietLabel(n.diet)}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}

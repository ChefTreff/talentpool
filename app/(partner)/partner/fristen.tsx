import { DateList, DateRow } from "@/components/ui/DateRow";
import type { PartnerDeadline } from "./types";

/**
 * Fristen einer Edition, überfällige zuerst, dann die kommenden der Reihe nach.
 * Übersicht und Checkliste zeigen sie gleich (PART-057: „Seiten angleichen“) —
 * die Übersicht die nächsten vier, die Checkliste alle.
 *
 * Ausserhalb einer Komponente, weil `Date.now()` im Rumpf einer Komponente
 * unrein ist (`react-hooks/purity`): das Ergebnis hängt vom Zeitpunkt des
 * Renderns ab. Beide Seiten sind `force-dynamic`, der Zeitbezug ist gewollt
 * und steht deshalb an einer Stelle, an der man ihn sieht.
 */
export function fristenAuswahl(deadlines: PartnerDeadline[], anzahl?: number) {
  const jetzt = Date.now();
  const mitFrist = deadlines.filter((d) => d.due_at);
  const ueberfaellig = mitFrist
    .filter((d) => new Date(d.due_at!).getTime() <= jetzt)
    .sort((a, b) => b.due_at!.localeCompare(a.due_at!));
  const kommend = mitFrist
    .filter((d) => new Date(d.due_at!).getTime() > jetzt)
    .sort((a, b) => a.due_at!.localeCompare(b.due_at!));
  const alle = [...ueberfaellig, ...kommend];
  return {
    fristen: anzahl === undefined ? alle : alle.slice(0, anzahl),
    naechste: kommend[0] ?? null,
    jetzt,
  };
}

export function fristTitel(d: PartnerDeadline, locale: string): string {
  return (locale === "en" ? d.label_en : d.label_de) ?? d.label_de ?? d.key;
}

/** Fristen als Zeilen mit Datumsspalte — überfällige mit Balken und Wort. */
export function FristenListe({
  fristen,
  jetzt,
  locale,
  dateLocale,
  overdueLabel,
}: {
  fristen: PartnerDeadline[];
  jetzt: number;
  locale: string;
  dateLocale: string;
  overdueLabel: string;
}) {
  const kurzDatum = new Intl.DateTimeFormat(dateLocale, { day: "numeric", month: "short" });
  return (
    <DateList>
      {fristen.map((d) => {
        const spaet = new Date(d.due_at!).getTime() <= jetzt;
        return (
          <DateRow
            key={d.key}
            date={kurzDatum.format(new Date(d.due_at!))}
            note={spaet ? overdueLabel : undefined}
            overdue={spaet}
            title={fristTitel(d, locale)}
            subtitle={(locale === "en" ? d.description_en : d.description_de) ?? undefined}
          />
        );
      })}
    </DateList>
  );
}

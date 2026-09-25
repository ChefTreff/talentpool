import { SectionTabs } from "@/components/layout/SectionTabs";

const BASE = "/partner/buehne";

/**
 * Drei Sichten auf die eigene Standbühne: Kalender (Board), Tabelle (PART-078)
 * und Gäste (PART-081). `TableTabs` aus dem Board-Kern kennt nur Kalender und
 * Tabelle — die Gäste gibt es nur beim Partner, also steht die Leiste hier.
 * Eigene Pfade statt eines Parameters, damit jede Sicht ein Lesezeichen verträgt.
 */
export function BuehnenTabs({ t }: { t: { label: string; board: string; table: string; guests: string } }) {
  return (
    <SectionTabs
      label={t.label}
      items={[
        { href: BASE, label: t.board, exact: true },
        { href: `${BASE}/tabelle`, label: t.table },
        { href: `${BASE}/gaeste`, label: t.guests },
      ]}
    />
  );
}

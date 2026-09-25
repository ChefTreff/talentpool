import { SectionTabs } from "@/components/layout/SectionTabs";

const BASE = "/partner/company-tour";

/**
 * Drei Sichten auf die Company Tour (PART-046): der eigene Stopp mit den
 * Angaben, die Bewerbungen auf die Tour und die Teilnehmenden. Eigene Pfade
 * statt eines Parameters — wie bei der Standbühne, damit jede Sicht ein
 * Lesezeichen verträgt.
 */
export function TourTabs({ t }: { t: { label: string; stop: string; applications: string; participants: string } }) {
  return (
    <SectionTabs
      label={t.label}
      items={[
        { href: BASE, label: t.stop, exact: true },
        { href: `${BASE}/bewerbungen`, label: t.applications },
        { href: `${BASE}/teilnehmende`, label: t.participants },
      ]}
    />
  );
}

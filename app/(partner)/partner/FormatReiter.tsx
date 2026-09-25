import { SectionTabs } from "@/components/layout/SectionTabs";

/**
 * Reiter eigener Formate mit Bewerbung (PART-045, PART-082): die Seite des
 * Formats und daneben Bewerbungen, Teilnehmende und Fragen — eigene Pfade wie
 * bei Standbühne und Company Tour, damit jede Sicht ein Lesezeichen verträgt.
 */
export function FormatReiter({
  basis,
  erster,
  t,
}: {
  /** Pfad der Formatseite, etwa `/partner/side-event`. */
  basis: string;
  /** Beschriftung des ersten Reiters (Inhalt, Side-Event, Tische …). */
  erster: string;
  t: { label: string; tabApplications: string; tabParticipants: string; tabQuestions: string };
}) {
  return (
    <SectionTabs
      label={t.label}
      items={[
        { href: basis, label: erster, exact: true },
        { href: `${basis}/bewerbungen`, label: t.tabApplications },
        { href: `${basis}/teilnehmende`, label: t.tabParticipants },
        { href: `${basis}/fragen`, label: t.tabQuestions },
      ]}
    />
  );
}

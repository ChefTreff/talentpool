import { SectionTabs } from "@/components/layout/SectionTabs";

/**
 * Reiter eigener Formate mit Bewerbung (PART-045, PART-082): die Seite des
 * Formats und daneben Bewerbungen, Teilnehmende und Fragen — eigene Pfade wie
 * bei Standbühne und Company Tour, damit jede Sicht ein Lesezeichen verträgt.
 *
 * Hat die Seite mehrere Instanzen (zwei Masterclasses, QS-079), steht der Umschalter **über** diesen
 * Reitern, und `suffix` (`?instanz=<id>`) hängt die gewählte Instanz an jeden Reiter: wer von „Inhalt“
 * zu „Bewerbungen“ wechselt, bleibt in derselben Masterclass. Sichten (diese Reiter) und Instanzen
 * stehen nie in einer Leiste.
 */
export function FormatReiter({
  basis,
  erster,
  suffix = "",
  t,
}: {
  /** Pfad der Formatseite, etwa `/partner/side-event`. */
  basis: string;
  /** Beschriftung des ersten Reiters (Inhalt, Side-Event, Tische …). */
  erster: string;
  /** Abfrage, die jeder Reiter mitnimmt (`?instanz=<id>`); leer ohne Umschalter. */
  suffix?: string;
  t: { label: string; tabApplications: string; tabParticipants: string; tabQuestions: string };
}) {
  return (
    <SectionTabs
      label={t.label}
      items={[
        { href: `${basis}${suffix}`, label: erster, exact: true },
        { href: `${basis}/bewerbungen${suffix}`, label: t.tabApplications },
        { href: `${basis}/teilnehmende${suffix}`, label: t.tabParticipants },
        { href: `${basis}/fragen${suffix}`, label: t.tabQuestions },
      ]}
    />
  );
}

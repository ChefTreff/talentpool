"use client";

import { SectionTabs } from "@/components/layout/SectionTabs";

/**
 * Vorlagen und Protokoll sind zwei Blicke auf dieselbe Sache und gehören
 * nebeneinander — nicht als zwei Punkte in der Seitenleiste, die dreimal
 * dasselbe Wort tragen. **Vorlagen zuerst** (ADM-102 b); wer nur eine
 * Vorlagen-Kategorie bearbeiten darf, sieht das Protokoll gar nicht
 * (`mitProtokoll` false): es nennt Empfängeradressen und gehört dem Abschnitt `mail`.
 */
export function MailTabs({
  label,
  log,
  templates,
  mitProtokoll = true,
}: {
  label: string;
  log: string;
  templates: string;
  mitProtokoll?: boolean;
}) {
  return (
    <SectionTabs
      label={label}
      items={[
        { href: "/admin/mail/vorlagen", label: templates },
        ...(mitProtokoll ? [{ href: "/admin/mail", label: log, exact: true }] : []),
      ]}
    />
  );
}

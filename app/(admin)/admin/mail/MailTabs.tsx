"use client";

import { SectionTabs } from "@/components/layout/SectionTabs";

/**
 * Protokoll und Vorlagen sind zwei Blicke auf dieselbe Sache und gehören
 * nebeneinander — nicht als zwei Punkte in der Seitenleiste, die dreimal
 * dasselbe Wort tragen.
 */
export function MailTabs({
  label,
  log,
  templates,
}: {
  label: string;
  log: string;
  templates: string;
}) {
  return (
    <SectionTabs
      label={label}
      items={[
        { href: "/admin/mail", label: log, exact: true },
        { href: "/admin/mail/vorlagen", label: templates },
      ]}
    />
  );
}

import Link from "next/link";
import type { ReactNode } from "react";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { AreaShell } from "@/components/layout/AreaShell";

export const dynamic = "force-dynamic";

/**
 * Speaker-Leads: Rolle `speaker_manager` (plus Team). Deutsch zuerst — das
 * Lead-Portal ist ein internes Werkzeug, kein Gastbereich; deshalb hier kein
 * Sprach-Fallback wie im Speaker-Portal.
 *
 * Die Liste ist dicht, deshalb die breite Fläche.
 */
export default async function SpeakerLeadsLayout({ children }: { children: ReactNode }) {
  await requireArea("speaker-leads");
  const { t } = await getI18n("de");

  const items = [
    { href: "/speaker-leads", label: t.leads.navPipeline },
    { href: "/speaker-leads/board", label: t.leads.navBoard },
    { href: "/speaker-leads/einreichungen", label: t.leads.navSubmissions },
  ];

  return (
    <AreaShell area="speaker-leads" width="table">
      <nav
        aria-label={t.areas["speaker-leads"].name}
        className="mb-8 flex flex-wrap gap-1 border-b pb-3"
      >
        {items.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className="rounded-ct-sm px-2.5 py-1.5 text-[14px] font-semibold text-muted transition-colors hover:bg-surface-hover hover:text-ink"
          >
            {i.label}
          </Link>
        ))}
      </nav>
      {children}
    </AreaShell>
  );
}

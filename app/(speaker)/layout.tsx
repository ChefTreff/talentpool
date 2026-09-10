import Link from "next/link";
import type { ReactNode } from "react";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { AreaShell } from "@/components/layout/AreaShell";

export const dynamic = "force-dynamic";

/**
 * Speaker-Bereich für `speaker` und `speaker_assistant`.
 *
 * Englisch ist die Ausgangssprache (Entscheidungslog 10.09.): `getI18n("en")`
 * greift nur, wenn die Person keine Sprache gewählt hat — Profilsprache und
 * Umschalter gewinnen immer.
 */
export default async function SpeakerLayout({ children }: { children: ReactNode }) {
  await requireArea("speaker");
  const { t } = await getI18n("en");

  const items = [
    { href: "/speaker", label: t.speaker.navOverview },
    { href: "/speaker/session", label: t.speaker.navSession },
    { href: "/speaker/reisekosten", label: t.speaker.navExpenses },
    { href: "/speaker/profil", label: t.speaker.navProfile },
  ];

  return (
    <AreaShell area="speaker" width="content">
      <nav aria-label={t.areas.speaker.name} className="mb-8 flex flex-wrap gap-1 border-b pb-3">
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

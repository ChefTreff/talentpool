import type { ReactNode } from "react";
import { requireArea } from "@/lib/auth";
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
  return (
    <AreaShell area="speaker-leads" width="table">
      {children}
    </AreaShell>
  );
}

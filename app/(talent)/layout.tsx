import type { ReactNode } from "react";
import { requireArea } from "@/lib/auth";
import { AreaShell } from "@/components/layout/AreaShell";

export const dynamic = "force-dynamic";

/** Talent-Bereich: jede eingeloggte Person, Top-Nav, Formularbreite. */
export default async function TalentLayout({ children }: { children: ReactNode }) {
  await requireArea("talent");
  return (
    <AreaShell area="talent" width="text">
      {children}
    </AreaShell>
  );
}

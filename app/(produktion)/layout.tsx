import type { ReactNode } from "react";
import { requireArea } from "@/lib/auth";
import { AreaShell } from "@/components/layout/AreaShell";

export const dynamic = "force-dynamic";

/** Bereichs-Gate: ohne Login -> /login?next=…, ohne Rolle -> 404. */
export default async function ProduktionLayout({ children }: { children: ReactNode }) {
  await requireArea("produktion");
  return <AreaShell area="produktion">{children}</AreaShell>;
}

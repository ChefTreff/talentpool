import type { ReactNode } from "react";
import { getI18n } from "@/lib/i18n";
import { SidebarShell } from "@/components/layout/SidebarShell";
import { getVolunteerScope } from "./volunteers/scope";
import { canSeeShifts } from "./volunteers/types";

export const dynamic = "force-dynamic";

/**
 * Volunteer-Bereich.
 *
 * Anders als die übrigen Bereiche steht dieser **jeder angemeldeten Person**
 * offen: die Bewerbung ist der Einstieg, die Rolle `volunteer` gibt es erst
 * mit der Zusage. `requireArea("volunteers")` würde genau die aussperren, die
 * sich bewerben wollen. Der Umschalter oben bleibt rollenbasiert.
 *
 * Was jemand sieht, entscheidet weiterhin die Datenbank: `my_*` kennt nur die
 * eigene Person, Schichten gibt es erst nach der Zusage.
 */
export default async function VolunteersLayout({ children }: { children: ReactNode }) {
  const { t } = await getI18n();
  const { profile } = await getVolunteerScope();

  const items = [{ href: "/volunteers", label: t.volunteers.navProfile }];
  if (canSeeShifts(profile)) {
    items.push({ href: "/volunteers/schichten", label: t.volunteers.navShifts });
  }

  return (
    <SidebarShell
      area="volunteers"
      label={t.areas.volunteers.name}
      groups={[{ label: t.volunteers.title, items }]}
      rootHref="/volunteers"
    >
      {children}
    </SidebarShell>
  );
}

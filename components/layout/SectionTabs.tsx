"use client";

import { usePathname } from "next/navigation";
import { ChipLink } from "@/components/ui/Chip";

export type SectionTab = {
  href: string;
  label: string;
  /**
   * Nur bei genauer Übereinstimmung aktiv — für den ersten Reiter, dessen
   * Pfad Präfix aller anderen ist (`/admin/partner` vs.
   * `/admin/partner/bestellungen`).
   */
  exact?: boolean;
  /**
   * Zusätzliches Muster als Zeichenkette (Props überqueren die
   * Server-Client-Grenze, ein `RegExp` täte das nicht) — damit eine
   * Detailseite den Reiter ihrer Liste markiert.
   */
  detailPattern?: string;
  /**
   * Der Reiter ist aktiv, ob der Pfad es hergibt oder nicht. Für Reiter, die
   * über die **Adresszeile** wechseln (`?bereich=dateien`): `usePathname()` kennt
   * die Abfrage nicht, die Seite weiß es aber (QS-059). Setzt die Seite `aktiv`,
   * gilt es statt der Pfadprüfung.
   */
  aktiv?: boolean;
};

/** Reiter innerhalb eines Admin-Bereichs. Client nur wegen `usePathname()`. */
export function SectionTabs({ items, label }: { items: SectionTab[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="mb-6 flex flex-wrap gap-1 border-b pb-3">
      {items.map((item) => {
        const active = item.aktiv !== undefined ? item.aktiv : item.exact
          ? pathname === item.href ||
            (item.detailPattern ? new RegExp(item.detailPattern).test(pathname) : false)
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          // 32 px am Desktop, am Handy 44 (QS-059, Touch-Ziele wie QS-057) — beides hält `ChipLink`.
          <ChipLink key={item.href} href={item.href} aktiv={active}>
            {item.label}
          </ChipLink>
        );
      })}
    </nav>
  );
}

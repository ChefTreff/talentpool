"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui/cn";

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
};

/** Reiter innerhalb eines Admin-Bereichs. Client nur wegen `usePathname()`. */
export function SectionTabs({ items, label }: { items: SectionTab[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="mb-6 flex flex-wrap gap-1 border-b pb-3">
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.href ||
            (item.detailPattern ? new RegExp(item.detailPattern).test(pathname) : false)
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-ct-sm px-2.5 py-1.5 text-[14px] font-semibold transition-colors",
              active
                ? "bg-accent-soft text-accent-deep"
                : "text-muted hover:bg-surface-hover hover:text-ink",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

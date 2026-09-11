"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui/cn";

export type SidebarItem = { href: string; label: string };
export type SidebarGroup = { label: string; items: SidebarItem[] };

/**
 * Die Liste in der Navy-Leiste. Client-Komponente allein wegen `usePathname()`
 * — welcher Punkt aktiv ist, weiß ein Layout auf dem Server nicht.
 */
export function SidebarNav({
  label,
  groups,
  /** Pfad des Bereichseinstiegs; nur er markiert exakt, alle anderen mit Präfix. */
  rootHref,
}: {
  label: string;
  groups: SidebarGroup[];
  rootHref: string;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label={label} className="flex flex-col gap-5">
      {groups
        .filter((g) => g.items.length > 0)
        .map((group) => (
          <div key={group.label}>
            <h2 className="ct-eyebrow mb-2 px-2.5 text-on-navy-muted">{group.label}</h2>
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active =
                  item.href === rootHref
                    ? pathname === rootHref
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "block rounded-ct-sm px-2.5 py-1.5 text-[14px] font-semibold transition-colors",
                        active
                          ? "bg-on-navy/15 text-on-navy"
                          : "text-on-navy-muted hover:bg-on-navy/10 hover:text-on-navy",
                      )}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
    </nav>
  );
}

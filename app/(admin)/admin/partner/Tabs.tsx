"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui/cn";

/** Die sieben Bereiche des Partner-Admins. Client nur wegen `usePathname()`. */
export function Tabs({
  items,
  label,
}: {
  items: { href: string; label: string }[];
  label: string;
}) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="mb-6 flex flex-wrap gap-1 border-b pb-3">
      {items.map((item) => {
        const active =
          item.href === "/admin/partner"
            ? pathname === item.href || /^\/admin\/partner\/[0-9a-f-]{36}$/.test(pathname)
            : pathname.startsWith(item.href);
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

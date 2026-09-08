import type { ReactNode } from "react";
import { AppHeader } from "./AppHeader";
import type { AreaKey } from "@/lib/areas";
import { cn } from "@/components/ui/cn";

/**
 * Gemeinsames Gerüst aller Bereiche: Navy-Topbar + linksbündige Arbeitsfläche.
 * `width` folgt den Breiten aus dem Design-Briefing §4.
 */
export function AreaShell({
  area,
  children,
  width = "content",
}: {
  area: AreaKey;
  children: ReactNode;
  width?: "content" | "table" | "text";
}) {
  return (
    <>
      <AppHeader current={area} />
      <main
        id="content"
        className={cn(
          "mx-auto w-full flex-1 px-6 py-8",
          width === "content" && "max-w-[1200px]",
          width === "table" && "max-w-[1400px]",
          width === "text" && "max-w-[800px]",
        )}
      >
        {children}
      </main>
    </>
  );
}

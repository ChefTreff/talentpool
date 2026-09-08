import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * Dichte Tabelle: Zebra aus, dünne Linien, sticky Header, Zeilenhöhe 44,
 * Zahlen rechts + tabular, Hover #F0F1F4 (Design-Briefing §5).
 * Breite Tabellen scrollen im eigenen Container, nie die Seite.
 */
export function Table({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-ct-lg border bg-surface">
      <table className={cn("w-full border-collapse text-left text-[15px]", className)}>
        {children}
      </table>
    </div>
  );
}

export function Thead({ children }: { children: ReactNode }) {
  return (
    <thead className="sticky top-0 z-10 bg-surface">
      <tr className="border-b">{children}</tr>
    </thead>
  );
}

export function Th({
  children,
  numeric,
  className,
}: {
  children?: ReactNode;
  numeric?: boolean;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "ct-eyebrow px-4 py-3 text-muted",
        numeric && "text-right",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Tbody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function Tr({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <tr className={cn("border-b last:border-0 hover:bg-surface-hover", className)}>
      {children}
    </tr>
  );
}

export function Td({
  children,
  numeric,
  className,
}: {
  children?: ReactNode;
  numeric?: boolean;
  className?: string;
}) {
  return (
    <td
      className={cn(
        "h-11 px-4 align-middle text-ink",
        numeric && "text-right tabular-nums",
        className,
      )}
    >
      {children}
    </td>
  );
}

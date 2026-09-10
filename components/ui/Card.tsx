import type { ReactNode } from "react";
import { cn } from "./cn";

/** Weiße Karte auf Off-White, Innenabstand 24 (Design-Briefing §4). */
export function Card({
  children,
  className,
  as: As = "div",
  id,
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article" | "li";
  /** Anker, wenn von anderer Stelle auf den Abschnitt verlinkt wird. */
  id?: string;
}) {
  return (
    <As id={id} className={cn("rounded-ct-lg border bg-surface p-6", className)}>
      {children}
    </As>
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h3 className="ct-h3 text-ink">{title}</h3>
        {description && <p className="ct-help mt-1">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** Kennzahl-Kachel für Dashboards (Design-Briefing §4). */
export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-ct-lg border bg-surface p-6">
      <div className="font-display text-[28px] font-extrabold leading-8 tabular-nums text-ink">
        {value}
      </div>
      <div className="ct-eyebrow mt-2 text-muted">{label}</div>
      {hint && <p className="ct-help mt-1">{hint}</p>}
    </div>
  );
}

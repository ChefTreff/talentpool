import type { ReactNode } from "react";

/** Ein H1 pro Seite, linksbündig, Versalien (Design-Briefing §3). */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-[800px]">
        {eyebrow && <p className="ct-eyebrow mb-1 text-muted">{eyebrow}</p>}
        <h1 className="ct-h1 text-ink">{title}</h1>
        {description && <p className="mt-2 text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

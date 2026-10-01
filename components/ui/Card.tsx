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
    // `scroll-mt`, sobald die Karte ein Anker ist: ohne das landet ihr
    // Titel nach dem Sprung unter dem Seitenkopf.
    <As id={id} className={cn("rounded-ct-lg border bg-surface p-6", id && "scroll-mt-20", className)}>
      {children}
    </As>
  );
}

export function CardHeader({
  title,
  description,
  action,
  ebene = "h3",
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  /**
   * `h2`, wenn die Karte ein **Abschnitt der Seite** ist (QS-054): dann
   * `.ct-h2`, wie das Talent-Muster es für Abschnitte vorsieht („ein `<h2>`
   * ist `.ct-h2` — auch in Karten“), und die Gliederung springt nicht von
   * `h1` auf `h3`. `h3` (Vorgabe) bleibt für Karten unter einem Abschnittskopf.
   */
  ebene?: "h2" | "h3";
}) {
  const Kopf = ebene;
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <Kopf className={ebene === "h2" ? "ct-h2 text-ink" : "ct-h3 text-ink"}>{title}</Kopf>
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
      {/* Dieselbe Grösse wie `.ct-h1` (28/32) — die Zahl ist die Überschrift der Kachel. */}
      <div className="ct-h1 tabular-nums text-ink">
        {value}
      </div>
      <div className="ct-eyebrow mt-2 text-muted">{label}</div>
      {hint && <p className="ct-help mt-1">{hint}</p>}
    </div>
  );
}

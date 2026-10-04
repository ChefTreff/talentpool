import type { ReactNode } from "react";
import { cn, kartenPadding, kartenRand } from "./cn";

/**
 * Weiße Karte auf Off-White, Innenabstand 24 (Design-Briefing §4).
 *
 * `className="p-0"` (Liste oder Tabelle bis zum Rand) und `p-4` (kompakt) wirken
 * wirklich (QS-055, `kartenPadding`); vorher blieb es bei 24 px. Eine randlose Karte
 * beschneidet ihren Inhalt an der Rundung (`kartenRand`).
 */
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
    <As
      id={id}
      className={cn(
        "rounded-ct-lg border bg-surface",
        kartenPadding(className),
        kartenRand(className),
        id && "scroll-mt-20",
        className,
      )}
    >
      {children}
    </As>
  );
}

/**
 * Kopf einer Karte. **Die Ebene ist Pflicht** (QS-054, Konrad 04.10.2026, K-60: „Versalien passen, bitte alle
 * umstellen“): ein Kopf ohne ausdrückliche Ebene steht nicht mehr im Code, und der Compiler verlangt sie.
 *
 * - **`h2`** (`.ct-h2`, Display-Schrift in Versalien 18/24): die Karte ist ein **Abschnitt der Seite**, auch wenn
 *   sie sich je Tag, Session oder Stopp wiederholt und jede ihren eigenen Inhalt trägt. Die Gliederung springt so
 *   nicht von `h1` auf `h3`.
 * - **`h3`** (`.ct-h3`, 16/24 in Normalschrift): die Karte ist ein **Unterabschnitt unter einer Überschrift derselben
 *   Einheit** (Inhalt, Goodies und Sprecher unter dem Titel einer Masterclass) oder ein **gleichförmiger
 *   Listeneintrag** (Challenge-Katalog, Karte je Team). Jeder `h3` steht im Wächtertest
 *   (`tests/cardheader-ebene.test.ts`) mit Grund.
 *
 * Die Ebene steht als **erste Eigenschaft** (`<CardHeader ebene="h2" title=…`); der Test zählt so.
 */
export function CardHeader({
  title,
  description,
  action,
  ebene,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  ebene: "h2" | "h3";
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

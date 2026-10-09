import type { ReactNode } from "react";
import { cn, kartenFlaeche, kartenPadding, kartenRand } from "./cn";

/**
 * Weiße Karte auf Off-White, Innenabstand 24 (Design-Briefing §4).
 *
 * `className="p-0"` (Liste oder Tabelle bis zum Rand) und `p-4` (kompakt) wirken
 * wirklich (QS-055, `kartenPadding`); vorher blieb es bei 24 px. Eine randlose Karte
 * beschneidet ihren Inhalt an der Rundung (`kartenRand`).
 *
 * **Eine Tönung wirkt** (QS-073, `kartenFlaeche`): `className="border-accent-soft bg-accent-soft"` gibt eine
 * Hinweisfläche, `border-warning-soft bg-warning-soft` eine Warnung. Vorher blieb die Karte bei `bg-accent-soft` weiß,
 * weil `bg-surface` im erzeugten CSS vor ihr stand. Der Rand gehört dazu: die Tönung steht immer mit ihrer Randfarbe,
 * und der Text darauf trägt den dunklen Ton derselben Familie (`text-accent-deep`, `text-warning-ink`; 5,1 bis 5,7:1).
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
        "rounded-ct-lg border",
        kartenFlaeche(className),
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
    // `flex-wrap` und am Textblock `flex-1 basis-72`: der Text darf wachsen und schrumpfen, rechnet aber mit 18 rem — passt die Aktion daneben,
    // steht sie rechts (auch bei langer Beschreibung am Desktop), sonst bricht sie **unter** den Text (links): am Handy nie rechts gequetscht, nie
    // der Knopftext auf zwei Zeilen (Skill-Regel 13, „Liste mit Zeilenaktion“, PART-149). Nur `min-w-0` ließe die Aktion schon unter den Text springen,
    // sobald die Beschreibung lang ist — gemessen 112 statt 68 px Kopfhöhe.
    <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-0 flex-1 basis-72">
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

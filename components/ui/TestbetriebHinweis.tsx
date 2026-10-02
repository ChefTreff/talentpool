import { cn } from "./cn";

/**
 * Der Hinweis „Testbetrieb“ (QS-056 c): ein schmaler Streifen unter der
 * Kopfzeile, solange das Team gegen die Live-Datenbank testet. Er sagt, womit
 * man spielen darf — Daten mit der Kennung `ZZTEST` sind Testdaten, alles
 * andere ist echt.
 *
 * **Eine Zeile, kein Overlay, nichts zum Wegklicken.** Er steht im Fluss der
 * Seite und scrollt mit; ein Banner, das die Bedienelemente überdeckt, oder ein
 * Hinweis, der erst bestätigt werden will, wäre auf dem Handy das
 * „Banner-Gewitter“, das der Auftrag ausschließt. Deshalb auch zwei Längen:
 * `kurz` steht immer, `mehr` erst ab `md` (768 px) — am Handy bleibt es bei
 * einer Zeile.
 *
 * Gleiche Sprache wie die übrigen Hinweisblöcke (`warning-soft`/`warning-ink`,
 * `role="note"`; Paar gemessen 5,1:1 — `referenzen/kontrast.mjs`, „Testbetrieb-
 * Hinweis“). Der Zustand steht als Wort (Eyebrow), die Farbe unterstützt nur.
 *
 * **Nicht in Seiten einbauen.** Der Baustein sitzt einmal in `SidebarShell`,
 * damit er in allen Bereichen gleich aussieht und sich an einer Stelle
 * abschalten lässt (`lib/testbetrieb.ts`). `breite` folgt der Breite des
 * Inhalts, damit der Text mit dem Seitentitel fluchtet.
 */
export function TestbetriebHinweis({
  label,
  kurz,
  mehr,
  breite = "content",
  className,
}: {
  /** „Testbetrieb“ — als Eyebrow vorangestellt. */
  label: string;
  /** Der Kernsatz: Daten mit ZZTEST sind Testdaten. Steht auf jeder Breite. */
  kurz: string;
  /** Die Regel dazu; erst ab 768 px, damit der Streifen am Handy eine Zeile bleibt. */
  mehr: string;
  /** Breite des Inhalts der Seite (`SidebarShell`): `content` (1200) oder `table` (1400). */
  breite?: "content" | "table";
  className?: string;
}) {
  return (
    <div role="note" className={cn("border-b border-warning-soft bg-warning-soft", className)}>
      <p
        className={cn(
          "mx-auto w-full px-4 py-1.5 ct-help text-warning-ink sm:px-6",
          breite === "table" ? "max-w-table" : "max-w-content",
        )}
      >
        {/* Ein echtes Leerzeichen zwischen Beschriftung und Satz, kein bloßer Außenabstand:
            Vorlesesoftware liest sonst „TestbetriebDaten“ als ein Wort. */}
        <span className="ct-eyebrow mr-1">{label}</span> {kurz}
        <span className="hidden md:inline"> {mehr}</span>
      </p>
    </div>
  );
}

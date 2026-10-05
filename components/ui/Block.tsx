"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Badge, type BadgeTone } from "./Badge";
import { cn } from "./cn";

/**
 * Ein Block eines Personenfensters oder einer Detailseite (LEAD-055): Kopf mit Titel, Marke und einer Zeile
 * Kurzfassung, darunter der Inhalt. **Aufklappbar** (`<details>`): was zum Stand gehört, steht offen, der
 * Rest als Zeile mit seiner Kurzfassung. So zeigt die Liste der Blöcke selbst schon, wo man steht — „Onboarding:
 * Nächste Pflicht“, „Hospitality: erledigt“ —, und man öffnet, was man bearbeiten will. **Die Reihenfolge der
 * Blöcke ändert sich nie, nur was offen ist** — wer das Fenster zum dritten Mal öffnet, findet „Hospitality“
 * an derselben Stelle.
 *
 * Aufklappen, Tastatur und Vorlesesoftware kommen vom Browser, wie beim `Accordion`. Der Kopf ist die
 * Überschrift (`ebene` ist Pflicht wie bei `CardHeader`): `h3` im Fenster unter dem Namen, `h2` auf einer Seite.
 * Mit `karte` steht der Block auf einer Karte (Detailseite), ohne als Abschnitt mit Trennlinie (im Fenster, das
 * schon die Karte ist — Karte in Karte steht auf der Verbotsliste).
 *
 * `marke` ist der Zustand des Blocks in Wort **und** Ton: „Nächste Pflicht“ (Akzent), „Offen · 3“ (gelb),
 * „Erledigt“ (grün). Die Kurzfassung steht nur, wenn der Block zu ist — offen sagt der Inhalt dasselbe.
 *
 * **Zwei Dinge öffnen einen zugeklappten Block von selbst**, weil sie sonst ins Leere liefen:
 * ein Sprung auf seinen Anker (`#hospitality` aus „Auf dieser Seite“ — der Browser öffnet ein `<details>`
 * nur, wenn das Ziel *in* ihm liegt, nicht wenn es das `<details>` selbst ist) und ein Feld darin, das die
 * Prüfung des Browsers bemängelt (ein Pflichtfeld in einem geschlossenen Block ließe das Formular ohne
 * Meldung stehen: „An invalid form control is not focusable“).
 */
export function Block({
  id,
  titel,
  ebene,
  marke,
  kurz,
  offen,
  karte = false,
  children,
  className,
}: {
  /** Anker (`#onboarding`) für die Übersicht „Auf dieser Seite“ und für „Nächste Pflicht“. */
  id?: string;
  titel: string;
  ebene: "h2" | "h3";
  marke?: { text: string; ton: BadgeTone };
  /** Eine Zeile für den zugeklappten Block („Kontaktiert seit 02.10. · Prio A“). */
  kurz?: string;
  /** Beim Laden offen. */
  offen?: boolean;
  /** Auf einer Karte (Detailseite) statt als Abschnitt mit Trennlinie (Fenster). */
  karte?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const Kopf = ebene;
  const el = useRef<HTMLDetailsElement | null>(null);

  useEffect(() => {
    const d = el.current;
    if (!d) return;
    const oeffne = () => {
      d.open = true;
    };
    // `invalid` steigt nicht auf: nur die Fangphase am Block bekommt es von den Feldern darin mit.
    d.addEventListener("invalid", oeffne, true);
    const zumAnker = () => {
      if (id && window.location.hash === `#${id}`) oeffne();
    };
    zumAnker();
    window.addEventListener("hashchange", zumAnker);
    return () => {
      d.removeEventListener("invalid", oeffne, true);
      window.removeEventListener("hashchange", zumAnker);
    };
  }, [id]);

  return (
    <details
      ref={el}
      id={id}
      open={offen}
      className={cn("group scroll-mt-20", karte ? "rounded-ct-lg border bg-surface" : "border-t", className)}
    >
      {/* Die öffnende Zeile trägt die 44 px selbst: der Wächter zu QS-059 prüft sie zeilenweise. */}
      <summary className={cn("flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-0.5 py-3 [&::-webkit-details-marker]:hidden", karte && "px-4 sm:px-6")}>
        <Kopf className={cn("min-w-0 flex-1", ebene === "h2" ? "ct-h2 text-ink" : "ct-h3 text-ink")}>{titel}</Kopf>
        {marke && <Badge tone={marke.ton}>{marke.text}</Badge>}
        <svg
          aria-hidden
          focusable="false"
          viewBox="0 0 12 12"
          className="h-3 w-3 shrink-0 text-accent transition-transform duration-150 group-open:rotate-180"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 4.5 6 7.5 9 4.5" />
        </svg>
        {kurz && <span className="basis-full ct-help group-open:hidden">{kurz}</span>}
      </summary>
      <div className={cn("pb-5", karte && "px-4 sm:px-6")}>{children}</div>
    </details>
  );
}

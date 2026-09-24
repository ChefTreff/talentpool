import type { ReactNode } from "react";
import { AppleMarke, GoogleKalenderMarke, MicrosoftMarke } from "@/components/brand/KalenderMarken";
import { googleKalenderUrl, outlookKalenderUrl, type KalenderTermin } from "@/lib/kalender-links";
import { cn } from "./cn";
import { neuesFenster } from "./neues-fenster";

export type KalenderTexte = {
  /** „In den Kalender" — vor den Zeichen, sichtbar oder nur für Vorlesesoftware. */
  add: string;
  google: string;
  outlook: string;
  apple: string;
};

/**
 * Ein Termin in den Kalender — **immer** mit den drei Zeichen Google,
 * Microsoft und Apple (QS-043).
 *
 * Konrad, 24.09.: auf der Session-Seite gab es nur „In Kalender eintragen" —
 * das war der Apple-Weg allein, während die Speaker-Übersicht alle drei
 * zeigte. Jetzt gibt es die Reihe nur noch hier, und jede Stelle mit einem
 * Termin nimmt sie: Übersicht, Slot, Einladung.
 *
 * **Google und Microsoft** öffnen einen vorausgefüllten Termin in einem neuen
 * Fenster; die Adressen rechnet die Komponente selbst aus `termin`
 * (`lib/kalender-links.ts`), damit keine Stelle sie anders baut. **Apple**
 * kennt so einen Link nicht — dort importiert man eine Datei, unsere eigene
 * `.ics`. Die lädt herunter und bleibt deshalb im selben Fenster (QS-034).
 *
 * `beschriftung`: in einer Terminliste gibt die Zeile den Zusammenhang, dort
 * steht „In den Kalender" nur für Vorlesesoftware (`versteckt`). Allein in
 * einer Karte steht es sichtbar davor (`sichtbar`), sonst sind es drei
 * Zeichen ohne Frage.
 *
 * Die Zeichen sind 44 Pixel gross, auch wenn die Marke nur 16 misst: ein Ziel,
 * das man auf dem Telefon nicht trifft, ist kein Ziel (Design-Regel 7).
 */
export function KalenderKnoepfe({
  termin,
  ics,
  t,
  beschriftung = "versteckt",
  className,
}: {
  termin: KalenderTermin;
  /** Unsere eigene `.ics`-Route für diesen Termin — der Apple-Weg. */
  ics: string;
  t: KalenderTexte;
  beschriftung?: "sichtbar" | "versteckt";
  className?: string;
}) {
  return (
    <span className={cn("flex items-center gap-1", className)}>
      {beschriftung === "sichtbar" ? (
        <span className="ct-help mr-1">
          {t.add}
          <span className="sr-only">{`: ${termin.titel}`}</span>
        </span>
      ) : (
        <span className="sr-only">{`${t.add}: ${termin.titel}`}</span>
      )}
      <KalenderLink href={googleKalenderUrl(termin)} name={t.google} extern>
        <GoogleKalenderMarke />
      </KalenderLink>
      <KalenderLink href={outlookKalenderUrl(termin)} name={t.outlook} extern>
        <MicrosoftMarke />
      </KalenderLink>
      <KalenderLink href={ics} name={t.apple}>
        <AppleMarke />
      </KalenderLink>
    </span>
  );
}

function KalenderLink({
  href,
  name,
  extern,
  children,
}: {
  href: string;
  name: string;
  /** Führt aus dem Portal heraus (Google, Microsoft): neues Fenster mit Ansage. */
  extern?: boolean;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      title={name}
      // Die `.ics` bewusst ohne `download`: iOS bietet beim Öffnen „Zum
      // Kalender hinzufügen" an — mit `download` würde die Datei nur abgelegt.
      {...(extern ? neuesFenster : {})}
      aria-label={name}
      className="flex h-11 w-11 items-center justify-center rounded-ct-sm transition-colors hover:bg-surface-hover"
    >
      {children}
    </a>
  );
}

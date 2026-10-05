"use client";

import { useId, useState, type ReactNode } from "react";
import { Button, Spinner } from "./Button";
import { cn } from "./cn";

/**
 * Datei wählen und hochladen — in **zwei** Schritten.
 *
 * Vorher war es ein `<label>`, das wie ein Umriss-Knopf aussah, mit dem
 * echten Feld unsichtbar darin; die Auswahl startete den Upload sofort.
 * Konrad im Speaker-Durchgang (QS-025): „sieht nicht klickbar aus, der
 * Upload wirkt versteckt". Beides stimmt, und es hängt zusammen — wenn
 * Auswählen und Hochladen dieselbe Geste sind, muss der Knopf beides
 * versprechen und kann keines davon deutlich sagen.
 *
 * Jetzt: erst ein echter `<Button>` zum Auswählen, dann der Dateiname mit
 * einer eigenen Aktion „Upload" daneben. Wer die falsche Datei erwischt hat,
 * sieht es **vor** dem Hochladen und kann wechseln, statt eine falsche
 * Fassung einzureichen und sie ersetzen zu lassen.
 *
 * Die Aufrufer ändern sich dadurch nicht: `onFile` wird weiterhin mit der
 * Datei gerufen, nur eben erst beim Klick auf „Upload“. Die Komponente hält
 * die Auswahl so lange selbst.
 *
 * **Ausnahme `sofort`** (TAL-017, Konrad 01.10.: „Hochladen braucht zwei
 * Schritte … das Bild soll direkt nach der Auswahl im Dateifenster
 * hochgeladen werden“): Für ein Porträt und vergleichbare Einzelbilder ruft
 * die Auswahl `onFile` gleich auf, ohne zweiten Klick. Dort ist die falsche
 * Datei billig — das Bild steht sofort neben dem Knopf, „Ersetzen“ ist ein
 * Klick, und ein Entfernen gibt es auch. Bei Dokumenten (Präsentation, Beleg,
 * Lebenslauf) bleibt es bei der Prüfung vor dem Hochladen. Bei Fotos von
 * Personen öffnet `onFile` den Zuschnitt (`BildZuschnitt`, ADM-066); hochgeladen
 * wird erst der Ausschnitt.
 *
 * `laedt` ist der Zwischenzustand dazu: der Ring ersetzt das Symbol, der
 * Knopf bleibt in voller Farbe (statt blass wie `disabled`, das wie „geht
 * nicht“ aussieht), und Vorlesesoftware bekommt die Beschriftung als Status.
 * Fehler meldet der Aufrufer — als Toast, wo es kein Formular gibt.
 *
 * Kein `display:none` für das Feld, sondern `sr-only` — ausgeblendete
 * Formularfelder sind für manche Hilfsmittel nicht mehr erreichbar.
 *
 * `variant="secondary"` für Listen mit einem Knopf je Zeile (Partnergrafiken,
 * PART-041): sonst stünden zehn Primärknöpfe untereinander, und die eine
 * Hauptaktion der Seite ginge darin unter.
 */
export function FileButton({
  label,
  uploadLabel = "Upload",
  changeLabel,
  accept,
  disabled,
  onFile,
  onFiles,
  hint,
  icon,
  className,
  variant = "primary",
  size = "md",
  sofort = false,
  laedt = false,
}: {
  /** Beschriftung des Auswahl-Knopfes, z. B. „Datei auswählen". */
  label: string;
  /** Beschriftung der Upload-Aktion. */
  uploadLabel?: string;
  /** „Andere Datei" — ohne Angabe wird `label` wiederverwendet. */
  changeLabel?: string;
  accept?: string;
  disabled?: boolean;
  onFile?: (file: File) => void;
  /**
   * Mehrere Dateien auf einmal (TAL-010, Fotoauswahl des Teams): das Feld
   * erlaubt Mehrfachauswahl, und die Auswahl startet den Upload gleich — wie
   * `sofort`. Wer `onFiles` setzt, braucht `onFile` nicht.
   */
  onFiles?: (files: File[]) => void;
  hint?: string;
  icon?: ReactNode;
  className?: string;
  /**
   * `secondary` für Listen mit einem Knopf je Zeile (LEAD-023): sonst stünden
   * viele primäre Aktionen untereinander (Skill-Regel 1). Dieselben Farben wie
   * `<Button variant="secondary">`.
   */
  variant?: "primary" | "secondary";
  /**
   * `sm` für eine Zeile mit anderen kleinen Knöpfen (ADM-075, Partnergrafiken): 32 px wie `<Button size="sm">`, am
   * Handy 44. Der Auswahl-Knopf stand sonst als einziger 44 px hoch zwischen 32-px-Nachbarn. `md` (Vorgabe) bleibt
   * der Knopf einer eigenen Zeile.
   */
  size?: "md" | "sm";
  /**
   * Die Auswahl startet den Upload gleich: `onFile` läuft direkt aus dem
   * Dateifenster, es gibt keinen zweiten Klick. Für Porträts und andere
   * Einzelbilder (TAL-017); `uploadLabel` und `changeLabel` entfallen.
   */
  sofort?: boolean;
  /** Der Upload läuft: Ring statt Symbol, volle Farbe, `label` als Status. Setzt der Aufrufer, der den Upload kennt. */
  laedt?: boolean;
}) {
  const id = useId();
  const [gewaehlt, setGewaehlt] = useState<File | null>(null);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {gewaehlt ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="ct-small min-w-0 break-all text-ink">{gewaehlt.name}</span>
          <Button
            size="sm"
            disabled={disabled}
            onClick={() => {
              onFile?.(gewaehlt);
              // Die Auswahl ist verbraucht: der Aufrufer meldet Erfolg oder
              // Fehler selbst, und eine stehengebliebene Datei liesse offen,
              // ob sie schon oben ist.
              setGewaehlt(null);
            }}
          >
            {uploadLabel}
          </Button>
          <label htmlFor={id} className="ct-link ct-small cursor-pointer">
            {changeLabel ?? label}
          </label>
        </div>
      ) : (
        <label htmlFor={id} className="w-fit" aria-busy={laedt || undefined}>
          {/* Der sichtbare Knopf ist ein `<span>` im Button-Gewand: ein echtes
              `<button>` im `<label>` fängt den Klick ab, statt ihn an das Feld
              weiterzureichen. Tastatur und Vorlesesoftware bedienen weiter das
              Feld selbst, das direkt darunter liegt. */}
          <span
            className={cn(
              "inline-flex cursor-pointer items-center gap-2 rounded-ct-md ct-label transition-colors",
              size === "sm" ? "h-8 px-3 pointer-coarse:min-h-11" : "min-h-11 px-5",
              variant === "secondary"
                ? "border-2 border-accent bg-transparent text-accent-strong hover:bg-accent/10"
                : "bg-accent-strong text-on-navy hover:bg-accent-deep",
              "focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent",
              // Beim Laden bleibt die Farbe stehen — nur sperren, nicht ausblenden.
              (disabled || laedt) && "pointer-events-none",
              disabled && !laedt && "opacity-40",
            )}
          >
            {laedt ? <Spinner /> : icon ?? (
              <svg
                viewBox="0 0 16 16"
                className="h-4 w-4 shrink-0"
                aria-hidden
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M8 11V3m0 0L5 6m3-3 3 3M2.5 11v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2" />
              </svg>
            )}
            {label}
          </span>
        </label>
      )}

      <input
        id={id}
        type="file"
        accept={accept}
        multiple={Boolean(onFiles)}
        disabled={disabled || laedt}
        className="sr-only"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (onFiles) {
            if (files.length) onFiles(files);
            return;
          }
          const file = files[0];
          if (!file) return;
          if (sofort) onFile?.(file);
          else setGewaehlt(file);
        }}
      />
      {/* Vorlesesoftware: der Wortlaut des Zwischenzustands als Status. */}
      <span role="status" className="sr-only">
        {laedt ? label : ""}
      </span>

      {hint && <p className="ct-help">{hint}</p>}
    </div>
  );
}

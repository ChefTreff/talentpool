import { cn } from "./cn";

export type Stufe = { key: string; label: string };

/**
 * Wo eine Sache in einem Ablauf steht — als Leiste aus gleich breiten Stücken, ein Stück je Stufe
 * (LEAD-055: der Stand eines Speakers von „Lead“ bis „Teilgenommen“; ebenso brauchbar für eine
 * Bewerbung, ein Onboarding, eine Bestellung).
 *
 * **Eine Zeile statt acht Knöpfen.** Das Personenfenster zeigte den Stand als acht gleich gewichtete
 * Knöpfe; man sah nicht, wo der Speaker steht und was als Nächstes kommt. Die Leiste zeigt den Weg:
 * erledigte Stufen gefüllt, die aktuelle dicker und mit Namen, die übrigen blass. Geändert wird der
 * Stand nicht hier, sondern über die Hauptaktion und das Menü des Kopfes — die Leiste liest nur.
 *
 * **Zustand in Form und Wort** (Regel 4): die aktuelle Stufe ist dicker (Form), ihr Name steht fett
 * (Wort) und für Vorlesesoftware trägt sie `aria-current="step"`; „Schritt 2 von 7“ steht als Text
 * da, am Handy sichtbar, am Desktop für Vorlesesoftware. Farbe allein trägt nichts.
 *
 * **Breite:** ab 640 px stehen alle Namen unter ihren Stücken (zweizeilig umbrochen), darunter nur
 * die Leiste und eine Zeile „Name · Schritt n von m“. Eine Stufe, die der Ablauf **beendet** (eine
 * Absage), gehört nicht auf die Leiste: `ende` hält sie an — die Stücke blass, die Namen unverändert lesbar (nur
 * die Stücke sind Zierde) —, mit einem Wort davor.
 */
export function Stufenleiste({
  schritte,
  aktuell,
  label,
  zaehler,
  ende,
  className,
}: {
  schritte: Stufe[];
  /** Schlüssel der aktuellen Stufe. Unbekannt gilt wie die erste. */
  aktuell: string;
  /** Zugänglicher Name der Liste, z. B. „Stand der Ansprache“. */
  label: string;
  /** Der Satz „Schritt 2 von 7“ — vom Aufrufer, weil er ins Wörterbuch gehört. */
  zaehler: string;
  /** Der Ablauf ist zu Ende gegangen (Absage): die Leiste steht still und zeigt dieses Wort davor. */
  ende?: string;
  className?: string;
}) {
  const gefunden = schritte.findIndex((s) => s.key === aktuell);
  const index = gefunden < 0 ? 0 : gefunden;
  const name = schritte[index]?.label ?? "";

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-start gap-3">
        {ende && <span className="ct-label shrink-0 text-error-ink">{ende}</span>}
        <ol aria-label={label} className="flex min-w-0 flex-1 gap-1">
          {schritte.map((s, i) => {
            const aktiv = !ende && i === index;
            const erledigt = !ende && i < index;
            return (
              <li key={s.key} aria-current={aktiv ? "step" : undefined} className="min-w-0 flex-1">
                <span
                  aria-hidden
                  className={cn(
                    "block rounded-full",
                    aktiv ? "h-2 bg-accent-strong" : "h-1.5",
                    erledigt && "bg-accent",
                    !aktiv && !erledigt && "bg-border",
                    ende && "opacity-60",
                  )}
                />
                {/* Unter 640 px nur für Vorlesesoftware: dort steht der Name der aktuellen Stufe in der Zeile darunter. */}
                <span
                  className={cn(
                    "mt-1.5 line-clamp-2 break-words ct-help max-sm:sr-only",
                    aktiv && "font-semibold text-ink",
                  )}
                >
                  {s.label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      {/* Am Handy fehlen die Namen unter den Stücken: eine Zeile sagt, wo man steht. Ab 640 px bleibt sie für
          Vorlesesoftware („Schritt 2 von 7“). */}
      <p className="ct-small text-ink sm:sr-only">
        {/* Nach einem Ende (Absage) steht hier das Wort des Endes: „Lead · Schritt 1 von 7“ behauptete einen Stand, an dem
            niemand mehr steht (LEAD-055). */}
        {ende ? (
          <span className="font-semibold text-error-ink">{ende}</span>
        ) : (
          <>
            <span className="font-semibold">{name}</span> · {zaehler}
          </>
        )}
      </p>
    </div>
  );
}

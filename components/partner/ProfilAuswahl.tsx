"use client";

import { cn } from "@/components/ui/cn";
import { PROFIL_FELDER, type ProfilFeld, type ProfilOption, type Zielprofil } from "./profil";

export { PROFIL_FELDER, profilUmschalten, type ProfilFeld, type ProfilOption, type Zielprofil } from "./profil";

/**
 * Gesuchte Profile wählen — dieselben Vokabulare wie im Teilnehmerprofil,
 * als Marken mit Kästchen (zuerst auf der Seite der Interview Tables, PART-048;
 * dieselbe Auswahl für den Stopp der Company Tour, PART-046).
 *
 * Der gewählte Zustand kommt aus React, nicht aus `has-[:checked]:` — ein Stil,
 * den niemand im Browser prüft, soll nicht die einzige Rückmeldung sein.
 */
export function ProfilAuswahl({
  felder,
  value,
  onToggle,
  disabled,
  t,
}: {
  felder: Record<ProfilFeld, ProfilOption[]>;
  value: Zielprofil;
  onToggle: (feld: ProfilFeld, key: string) => void;
  disabled?: boolean;
  /** `title`, `hint` und je Feld `profile_<feld>` als Legende. */
  t: Record<string, string>;
}) {
  return (
    <div>
      <h3 className="ct-label text-ink">{t.profileTitle}</h3>
      <p className="ct-help mt-1">{t.profileHint}</p>
      <div className="mt-3 flex flex-col gap-3">
        {PROFIL_FELDER.map((feld) => (
          <fieldset key={feld}>
            <legend className="ct-help">{t[`profile_${feld}`]}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {felder[feld].map((o) => {
                const an = (value[feld] ?? []).includes(o.key);
                return (
                  <label
                    key={o.key}
                    className={cn(
                      "ct-small inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-ct-sm border px-3 py-2 text-ink",
                      an ? "border-border-strong bg-canvas" : "border-border",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={an}
                      disabled={disabled}
                      onChange={() => onToggle(feld, o.key)}
                    />
                    {o.label}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
    </div>
  );
}

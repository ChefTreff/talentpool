"use client";

import { useId, type ReactNode } from "react";
import { Field } from "@/components/ui/Field";
import { MehrfachAuswahl } from "@/components/ui/MehrfachAuswahl";
import { PROFIL_FELDER, geaenderteSchluessel, type ProfilFeld, type ProfilOption, type Zielprofil } from "./profil";

export { PROFIL_FELDER, profilUmschalten, type ProfilFeld, type ProfilOption, type Zielprofil } from "./profil";

/**
 * Gesuchte Profile wählen — dieselben Vokabulare wie im Teilnehmerprofil (zuerst auf der Seite der
 * Interview Tables, PART-048; dieselbe Auswahl für den Stopp der Company Tour, PART-046).
 *
 * **Je Frage eine aufklappbare Zeile** (PART-128, `MehrfachAuswahl aufklappbar`). Bis dahin standen alle
 * Einträge als Marken mit Kästchen da: 27 auf einmal (Status 10, Berufserfahrung 8, Studienrichtung 9), am
 * Handy 1064 px — „sehr unübersichtlich“ (Konrad & Leopold, 05.10.). Jetzt zeigt jede Frage zugeklappt, was
 * gewählt ist, oder „Offen für alle“ (`t.profileOpen`) — der häufigste Fall, denn „Wählt nichts aus, wenn ihr
 * offen seid“ —, und ein Klick öffnet die Kästchen.
 *
 * **Die Schnittstelle bleibt `onToggle(feld, key)`.** Der Baustein meldet seine ganze neue Liste; hier wird sie
 * als der eine Schlüssel übersetzt, der sich geändert hat (`geaenderteSchluessel`). So ändert sich keine der
 * Seiten, die die Auswahl benutzen: Company Tour, Interview Tables und die Maske unter der Organisation im Admin.
 * Ein gespeicherter Wert, den das Vokabular nicht mehr kennt, steht als eigene Zeile da und lässt sich abwählen.
 *
 * **Zwei Zutaten für die Masken (K-94 Stufe 2b, PART-140):** `vorbelegung` steht zwischen Kopf und Fragen („Aus ‚Wen sucht ihr?‘ übernehmen“, `HiringUebernehmen`) —
 * die Maske hält den Entwurf, der Baustein zeigt nur, was sie hereingibt. `kopf={false}` blendet Titel und Hinweis aus, wo die Karte sie schon trägt (Masterclass:
 * `CardHeader` mit demselben Titel; zwei gleiche Überschriften untereinander wären Doppelung).
 */
export function ProfilAuswahl({
  felder,
  value,
  onToggle,
  disabled,
  vorbelegung,
  kopf = true,
  t,
}: {
  felder: Record<ProfilFeld, ProfilOption[]>;
  value: Zielprofil;
  onToggle: (feld: ProfilFeld, key: string) => void;
  disabled?: boolean;
  /** Die Vorbelegung aus „Wen sucht ihr?“ (`HiringUebernehmen`), über den Fragen; ohne sie steht dort nichts. */
  vorbelegung?: ReactNode;
  /** Titel und Hinweis zeigen (Voreinstellung); `false`, wo die umgebende Karte sie schon trägt. */
  kopf?: boolean;
  /** `profileTitle`, `profileHint`, `profileOpen` und je Feld `profile_<feld>` als Beschriftung. */
  t: Record<string, string>;
}) {
  const basis = useId();
  return (
    <div>
      {kopf && (
        <>
          <h3 className="ct-label text-ink">{t.profileTitle}</h3>
          <p className="ct-help mt-1">{t.profileHint}</p>
        </>
      )}
      {vorbelegung && <div className={kopf ? "mt-3" : undefined}>{vorbelegung}</div>}
      <div className={kopf || vorbelegung ? "mt-3 flex flex-col gap-3" : "flex flex-col gap-3"}>
        {PROFIL_FELDER.map((feld) => {
          const gewaehlt = value[feld] ?? [];
          return (
            <Field key={feld} label={t[`profile_${feld}`]} htmlFor={`${basis}-${feld}`}>
              <MehrfachAuswahl
                aufklappbar
                id={`${basis}-${feld}`}
                options={felder[feld].map((o) => ({ value: o.key, label: o.label }))}
                value={gewaehlt}
                onChange={(neu) => {
                  for (const key of geaenderteSchluessel(gewaehlt, neu)) onToggle(feld, key);
                }}
                leer={t.profileOpen}
                disabled={disabled}
              />
            </Field>
          );
        })}
      </div>
    </div>
  );
}

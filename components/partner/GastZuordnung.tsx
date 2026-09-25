"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import type { GastWahl } from "./gaeste";

/**
 * Gäste an einem Programmpunkt: zugeordnete als Kennzeichen mit „abnehmen“,
 * dazu die Auswahl der übrigen Gäste der Organisation. Dieselbe Komponente in
 * der Tabelle der Standbühne (PART-081) und auf der Talk-Seite (PART-088);
 * geschrieben wird von außen über `partner_assign_stage_guest`.
 *
 * Personen, die kein Gast der Organisation sind (reguläre Speaker, vom Team
 * zugeteilt), stehen ohne Knopf da — die teilt das Programm-Team zu.
 */
export function GastZuordnung({
  speakers,
  gaeste,
  canEdit,
  pending,
  t,
  onGast,
}: {
  /** Wer schon am Programmpunkt steht (Gäste und reguläre Speaker). */
  speakers: { person_id: string; name: string }[];
  /** Alle Gäste der Organisation. */
  gaeste: GastWahl[];
  canEdit: boolean;
  pending: boolean;
  t: { label: string; none: string; noGuests: string; choose: string; add: string; remove: string };
  onGast: (profileId: string, zuordnen: boolean) => void;
}) {
  const [wahl, setWahl] = useState("");
  const gastVonPerson = new Map(gaeste.map((g) => [g.person_id, g]));
  const frei = gaeste.filter((g) => !speakers.some((s) => s.person_id === g.person_id));
  return (
    <div className="flex flex-col gap-2">
      <p className="ct-label text-ink">{t.label}</p>
      {speakers.length === 0 ? (
        <p className="ct-help">{t.none}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {speakers.map((s) => {
            const gast = gastVonPerson.get(s.person_id);
            return (
              <li key={s.person_id}>
                <Badge tone={gast ? "accent" : "neutral"}>
                  {s.name}
                  {gast && canEdit && (
                    <button
                      type="button"
                      aria-label={t.remove.replace("{name}", s.name)}
                      className="text-muted transition-colors hover:text-error-ink"
                      disabled={pending}
                      onClick={() => onGast(gast.profile_id, false)}
                    >
                      ×
                    </button>
                  )}
                </Badge>
              </li>
            );
          })}
        </ul>
      )}
      {canEdit &&
        (gaeste.length === 0 ? (
          <p className="ct-help">{t.noGuests}</p>
        ) : (
          frei.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Select
                aria-label={t.choose}
                className="w-64"
                value={wahl}
                placeholder={t.choose}
                options={frei.map((g) => ({ value: g.profile_id, label: g.name }))}
                onChange={(e) => setWahl(e.target.value)}
              />
              <Button
                size="sm"
                variant="secondary"
                disabled={!wahl || pending}
                onClick={() => {
                  onGast(wahl, true);
                  setWahl("");
                }}
              >
                {t.add}
              </Button>
            </div>
          )
        ))}
    </div>
  );
}

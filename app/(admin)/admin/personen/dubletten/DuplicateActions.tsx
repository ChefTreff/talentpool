"use client";

import { useTransition } from "react";
import { setDuplicateStatus, type DupStatus } from "./actions";
import { Select } from "@/components/ui/Select";

/**
 * Stand eines Kandidatenpaars: offen, Dublette bestätigt, keine Dublette.
 *
 * Vorher drei Knöpfe, und der **aktuelle Stand war der gefüllte Primärknopf** —
 * auf jeder Karte der Liste stand ein gefüllter „Offen“, während die eigentliche
 * nächste Aktion („Zusammenführen prüfen“) nur sekundär war: die Rangfolge war
 * verkehrt (Skill Regel 1, QS-063). Ein Zustand ist kein Primärknopf; er steht,
 * wie bei Award und Initiativen, als Auswahl am Datensatz und gilt sofort.
 */
export function DuplicateActions({
  id,
  status,
  labels,
}: {
  id: string;
  status: string;
  labels: { isDupe: string; notDupe: string; open: string; state: string };
}) {
  const [pending, start] = useTransition();

  return (
    <Select
      aria-label={labels.state}
      className="w-48"
      disabled={pending}
      value={status}
      options={[
        { value: "open", label: labels.open },
        { value: "confirmed_dupe", label: labels.isDupe },
        { value: "not_dupe", label: labels.notDupe },
      ]}
      onChange={(e) => start(async () => void (await setDuplicateStatus(id, e.target.value as DupStatus)))}
    />
  );
}

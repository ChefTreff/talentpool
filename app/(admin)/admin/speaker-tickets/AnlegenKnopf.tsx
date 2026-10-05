"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { BegleitticketDialog, type KontingentZeile } from "./BegleitticketDialog";

type Strings = Record<string, string>;

/**
 * Der Knopf im Seitenkopf: „Begleitticket anlegen“ (ADM-076) — der Speaker wird im Dialog gewählt. Aus der Kontingent-Tabelle
 * öffnet dieselbe Maske mit vorgewähltem Speaker. Der **eine** primäre Knopf der Seite.
 */
export function AnlegenKnopf({
  speakers,
  t,
  rpcMessages,
}: {
  speakers: KontingentZeile[];
  t: Strings;
  rpcMessages: Record<string, string>;
}) {
  const [offen, setOffen] = useState(false);
  return (
    <>
      <Button onClick={() => setOffen(true)} disabled={speakers.length === 0}>
        {t.addCompanion}
      </Button>
      {offen && <BegleitticketDialog speakers={speakers} t={t} rpcMessages={rpcMessages} onClose={() => setOffen(false)} />}
    </>
  );
}

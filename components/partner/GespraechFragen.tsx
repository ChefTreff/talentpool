"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";

/**
 * Die Fragen **eines** Gesprächs im Schubfach (PART-150, Zeilenaktion „Fragen ändern“ der Gesprächsliste). Der Inhalt — die drei Abschnitte mit Katalogwahl
 * und eigenen Fragen — kommt fertig gezeichnet von der Seite und wird erst eingehängt, wenn das Schubfach offen ist: zwanzig Gespräche tragen sonst
 * zwanzigmal dieselben Kästchen im DOM. Der Knopf trägt den Bezug fürs Vorlesen („Fragen ändern: {Gespräch}“, Skill-Regel 13).
 */
export function GespraechFragen({
  titel,
  label,
  hinweis,
  schliessen,
  children,
}: {
  titel: string;
  label: string;
  hinweis: string;
  schliessen: string;
  children: ReactNode;
}) {
  const [offen, setOffen] = useState(false);
  return (
    <>
      <Button size="sm" variant="secondary" aria-label={`${label}: ${titel}`} onClick={() => setOffen(true)}>
        {label}
      </Button>
      <Drawer open={offen} onClose={() => setOffen(false)} title={titel} closeLabel={schliessen}>
        {offen && (
          <div className="flex flex-col gap-6">
            <p className="ct-help">{hinweis}</p>
            {children}
          </div>
        )}
      </Drawer>
    </>
  );
}

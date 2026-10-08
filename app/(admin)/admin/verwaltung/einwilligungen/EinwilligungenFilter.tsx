"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import { SuchFeld } from "@/components/ui/SuchFeld";
import { einwilligungenAdresse, type Ansicht } from "@/lib/einwilligungen/stand";

type Option = { value: string; label: string };
type Werte = { ansicht: Ansicht; typ: string; zustand: string; q: string };

/**
 * Umschalter und Filter der Einwilligungen (ADM-096). Wie bei Personen und
 * Protokoll gilt **jede Auswahl sofort** und steht in der Adresszeile; die Suche
 * wartet 300 ms nach dem letzten Zeichen. Oben der Umschalter „je Person / je
 * Eintrag“: Standard ist die Person (Konrad 08.10.), der Nachweis Zeile für
 * Zeile bleibt eine Umschaltung entfernt.
 */
export function EinwilligungenFilter({
  werte,
  typen,
  zustaende,
  t,
}: {
  werte: Werte;
  typen: Option[];
  zustaende: Option[];
  t: Record<string, string>;
}) {
  const router = useRouter();
  const pfad = usePathname();
  const [pending, start] = useTransition();
  const [suche, setSuche] = useState(werte.q);
  const warte = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gesendet = useRef(werte.q);

  useEffect(() => {
    if (werte.q !== gesendet.current) {
      gesendet.current = werte.q;
      setSuche(werte.q);
    }
  }, [werte.q]);
  useEffect(() => () => { if (warte.current) clearTimeout(warte.current); }, []);

  function setze(aenderung: Partial<Werte>) {
    const neu = { ...werte, q: suche.trim(), ...aenderung };
    gesendet.current = neu.q;
    start(() => router.replace(einwilligungenAdresse(pfad, neu)));
  }

  function beimTippen(wert: string) {
    setSuche(wert);
    if (warte.current) clearTimeout(warte.current);
    warte.current = setTimeout(() => setze({ q: wert.trim() }), 300);
  }

  const ansichten: { wert: Ansicht; label: string }[] = [
    { wert: "person", label: t.viewPerson },
    { wert: "eintrag", label: t.viewEntry },
  ];
  const gefiltert = Boolean(werte.typ || werte.zustand || werte.q);

  return (
    <div className="mb-6 flex flex-col gap-4" aria-busy={pending || undefined}>
      <div role="group" aria-label={t.viewLabel} className="flex flex-wrap gap-2">
        {ansichten.map((a) => (
          <Button
            key={a.wert}
            size="sm"
            variant={werte.ansicht === a.wert ? "secondary" : "ghost"}
            aria-pressed={werte.ansicht === a.wert}
            disabled={pending}
            onClick={() => setze({ ansicht: a.wert })}
          >
            {a.label}
          </Button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label={t.filterType} htmlFor="ew-typ">
          <Select id="ew-typ" value={werte.typ} placeholder={t.filterAll} options={typen} onChange={(e) => setze({ typ: e.target.value })} />
        </Field>
        <Field label={t.filterState} htmlFor="ew-zustand">
          <Select id="ew-zustand" value={werte.zustand} placeholder={t.filterAll} options={zustaende} onChange={(e) => setze({ zustand: e.target.value })} />
        </Field>
        <Field label={t.filterSearch} htmlFor="ew-q">
          <SuchFeld id="ew-q" value={suche} placeholder={t.searchPlaceholder} onChange={(e) => beimTippen(e.target.value)} />
        </Field>
      </div>
      {gefiltert && (
        <p>
          <Link className="ct-link ct-small" href={einwilligungenAdresse(pfad, { ansicht: werte.ansicht })}>
            {t.reset}
          </Link>
        </p>
      )}
    </div>
  );
}

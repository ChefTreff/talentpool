"use client";

import { useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { Von } from "@/lib/audit/anzeige";

type Option = { value: string; label: string };
type Werte = { von: Von; aktion: string; objekt: string; person: string; ab: string; bis: string };

/**
 * Filter des Protokolls (ADM-095 a, c). **Jede Auswahl gilt sofort** — kein
 * „Filtern“-Knopf: ein Feld ändern heisst, die Adresse ändern, und der Server
 * lädt die Liste neu. Der Zustand steht in der Adresszeile (Link teilen, Zurück-Knopf),
 * die Seite geht dabei auf 1 zurück.
 *
 * Oben der Umschalter „durch Personen / durch das System / alle“: die meisten
 * Einträge stammen vom System (Abgleiche), die Handlungen von Personen gehen
 * darin unter. Standard ist „Personen“.
 */
export function ProtokollFilter({
  werte,
  aktionen,
  objekte,
  personen,
  t,
}: {
  werte: Werte;
  aktionen: Option[];
  objekte: Option[];
  personen: Option[];
  t: Record<string, string>;
}) {
  const router = useRouter();
  const pfad = usePathname();
  const [pending, start] = useTransition();

  function setze(aenderung: Partial<Werte>) {
    const neu = { ...werte, ...aenderung };
    const p = new URLSearchParams();
    // „person“ ist der Standard und steht nicht in der Adresse.
    if (neu.von !== "person") p.set("von", neu.von);
    if (neu.aktion) p.set("aktion", neu.aktion);
    if (neu.objekt) p.set("objekt", neu.objekt);
    if (neu.person) p.set("person", neu.person);
    if (neu.ab) p.set("ab", neu.ab);
    if (neu.bis) p.set("bis", neu.bis);
    start(() => router.replace(`${pfad}${p.size ? `?${p}` : ""}`));
  }

  const umschalter: { wert: Von; label: string }[] = [
    { wert: "person", label: t.byPerson },
    { wert: "system", label: t.bySystem },
    { wert: "alle", label: t.byAll },
  ];
  const gefiltert = Boolean(werte.aktion || werte.objekt || werte.person || werte.ab || werte.bis);

  return (
    <div className="mb-6 flex flex-col gap-4" aria-busy={pending || undefined}>
      <div role="group" aria-label={t.filterBy} className="flex flex-wrap gap-2">
        {umschalter.map((u) => (
          <Button
            key={u.wert}
            size="sm"
            variant={werte.von === u.wert ? "secondary" : "ghost"}
            aria-pressed={werte.von === u.wert}
            disabled={pending}
            onClick={() => setze({ von: u.wert })}
          >
            {u.label}
          </Button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Field label={t.filterAction} htmlFor="al-action">
          <Select id="al-action" value={werte.aktion} placeholder={t.filterAll} options={aktionen} onChange={(e) => setze({ aktion: e.target.value })} />
        </Field>
        <Field label={t.filterObject} htmlFor="al-object">
          <Select id="al-object" value={werte.objekt} placeholder={t.filterAll} options={objekte} onChange={(e) => setze({ objekt: e.target.value })} />
        </Field>
        <Field label={t.filterActor} htmlFor="al-actor">
          <Select id="al-actor" value={werte.person} placeholder={t.filterAll} options={personen} onChange={(e) => setze({ person: e.target.value })} />
        </Field>
        <Field label={t.filterFrom} htmlFor="al-from">
          <Input id="al-from" type="date" value={werte.ab} onChange={(e) => setze({ ab: e.target.value })} />
        </Field>
        <Field label={t.filterTo} htmlFor="al-to">
          <Input id="al-to" type="date" value={werte.bis} onChange={(e) => setze({ bis: e.target.value })} />
        </Field>
      </div>
      {gefiltert && (
        <p>
          <Link className="ct-link ct-small" href={werte.von === "person" ? pfad : `${pfad}?von=${werte.von}`}>
            {t.clearFilters}
          </Link>
        </p>
      )}
    </div>
  );
}

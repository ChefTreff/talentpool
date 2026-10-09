"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Chip, ChipLink } from "@/components/ui/Chip";
import { Drawer } from "@/components/ui/Drawer";
import { SuchFeld } from "@/components/ui/SuchFeld";

export type ZugaengeFilter = "team" | "alle" | "gesperrt" | "ohne_login";

/**
 * Die Formulare im Schubfach schließen es nach dem Erfolg selbst: ihre Knoten kommen vom Server, und eine Funktion geht nicht über
 * die Grenze — also reicht ein Kontext die Schließen-Funktion durch (ADM-109).
 */
const SchubfachKontext = createContext<() => void>(() => {});
export const useSchubfachSchliessen = () => useContext(SchubfachKontext);

/**
 * Die Leiste über der Liste (ADM-094): Suche, vier Filter mit Zahl, zwei Aktionen.
 *
 * Die Filter sind **Links** — der Zustand liegt in der Adresse (`?filter=gesperrt`), die Seite rendert auf dem
 * Server, ein Lesezeichen oder ein geteilter Link zeigt dieselbe Liste. Sie beantworten die Frage „was ist der
 * Unterschied zwischen Team und Zugängen“ im Bedienelement: es ist **derselbe Bestand**, anders gefiltert.
 *
 * Eine primäre Aktion: „Teammitglied hinzufügen“. „Gerät anlegen“ (Kiosk-Konto) ist sekundär. **Beide öffnen ein Schubfach**
 * (ADM-109, Abnahme 09.10.2026; Skill-Regel 13): vorher klappten die Formulare als große Karte unter der Leiste auf und schoben die
 * Liste aus dem Bild. Das Schubfach des Hinzufügens hat **zwei Wege** — „Neu einladen“ und „Aus dem Talentpool“ —, statt dass der
 * zweite zugeklappt am Seitenende versteckt war. Die Formulare selbst kommen als Bausteine vom Server.
 *
 * **Am Handy** stehen die beiden Aktionen gleich breit nebeneinander (vorher rechtsbündig mit ungleichem Rand), ab 640 px rechts.
 */
export function ZugaengeKopf({
  suche,
  filter,
  zaehler,
  einladung,
  aufnehmen,
  geraet,
  t,
}: {
  suche: string;
  filter: ZugaengeFilter;
  zaehler: Record<ZugaengeFilter, number>;
  einladung: ReactNode;
  aufnehmen: ReactNode;
  geraet: ReactNode;
  t: Record<string, string>;
}) {
  const [offen, setOffen] = useState<"hinzufuegen" | "geraet" | null>(null);
  const [weg, setWeg] = useState<"einladen" | "aufnehmen">("einladen");
  const zu = () => setOffen(null);
  const filterAdresse = (f: ZugaengeFilter) => {
    const p = new URLSearchParams();
    if (f !== "team") p.set("filter", f);
    if (suche) p.set("q", suche);
    return `/admin/verwaltung/zugaenge${p.size ? `?${p}` : ""}`;
  };
  const filtern: { key: ZugaengeFilter; label: string }[] = [
    { key: "team", label: t.filterTeam },
    { key: "alle", label: t.filterAlle },
    { key: "gesperrt", label: t.filterGesperrt },
    { key: "ohne_login", label: t.filterOhneLogin },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <form className="flex min-w-64 flex-1 items-center gap-2 sm:max-w-sm" action="/admin/verwaltung/zugaenge" role="search">
          {filter !== "team" && <input type="hidden" name="filter" value={filter} />}
          <label className="flex-1">
            <span className="sr-only">{t.searchLabel}</span>
            <SuchFeld name="q" defaultValue={suche} placeholder={t.searchPlaceholder} />
          </label>
        </form>
        <nav aria-label={t.filterLabel} className="flex flex-wrap gap-1">
          {filtern.map((f) => (
            <ChipLink key={f.key} href={filterAdresse(f.key)} aktiv={filter === f.key}>
              {f.label}
              <span className="ml-1.5 tabular-nums text-muted">{zaehler[f.key]}</span>
            </ChipLink>
          ))}
        </nav>
        <div className="grid w-full grid-cols-2 gap-2 sm:ml-auto sm:flex sm:w-auto">
          <Button variant="secondary" aria-haspopup="dialog" onClick={() => setOffen("geraet")}>
            {t.openDevice}
          </Button>
          <Button aria-haspopup="dialog" onClick={() => setOffen("hinzufuegen")}>
            {t.addMember}
          </Button>
        </div>
      </div>

      <SchubfachKontext.Provider value={zu}>
        <Drawer open={offen === "hinzufuegen"} onClose={zu} title={t.addMember} closeLabel={t.drawerClose}>
          <div className="flex flex-col gap-5">
            <div role="group" aria-label={t.wayLabel} className="flex flex-wrap gap-1">
              <Chip aktiv={weg === "einladen"} onClick={() => setWeg("einladen")}>
                {t.wayInvite}
              </Chip>
              <Chip aktiv={weg === "aufnehmen"} onClick={() => setWeg("aufnehmen")}>
                {t.wayAdopt}
              </Chip>
            </div>
            {weg === "einladen" ? einladung : aufnehmen}
          </div>
        </Drawer>
        <Drawer open={offen === "geraet"} onClose={zu} title={t.openDevice} closeLabel={t.drawerClose}>
          {geraet}
        </Drawer>
      </SchubfachKontext.Provider>
    </div>
  );
}

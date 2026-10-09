"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { ChipLink } from "@/components/ui/Chip";
import { SuchFeld } from "@/components/ui/SuchFeld";

export type ZugaengeFilter = "team" | "alle" | "gesperrt" | "ohne_login";

/**
 * Die Leiste über der Liste (ADM-094): Suche, vier Filter mit Zahl, zwei Aktionen.
 *
 * Die Filter sind **Links** — der Zustand liegt in der Adresse (`?filter=gesperrt`), die Seite rendert auf dem
 * Server, ein Lesezeichen oder ein geteilter Link zeigt dieselbe Liste. Sie beantworten die Frage „was ist der
 * Unterschied zwischen Team und Zugängen“ im Bedienelement: es ist **derselbe Bestand**, anders gefiltert.
 *
 * Eine primäre Aktion: „Teammitglied einladen“. „Gerät anlegen“ (Kiosk-Konto) ist sekundär. Beide klappen ihr
 * Formular unter der Leiste auf; die Formulare selbst kommen als Bausteine vom Server.
 */
export function ZugaengeKopf({
  suche,
  filter,
  zaehler,
  einladung,
  geraet,
  t,
}: {
  suche: string;
  filter: ZugaengeFilter;
  zaehler: Record<ZugaengeFilter, number>;
  einladung: ReactNode;
  geraet: ReactNode;
  t: Record<string, string>;
}) {
  const [offen, setOffen] = useState<"einladen" | "geraet" | null>(null);
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
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="secondary" aria-expanded={offen === "geraet"} onClick={() => setOffen(offen === "geraet" ? null : "geraet")}>
            {t.openDevice}
          </Button>
          <Button aria-expanded={offen === "einladen"} onClick={() => setOffen(offen === "einladen" ? null : "einladen")}>
            {t.teamTitle}
          </Button>
        </div>
      </div>
      {offen === "einladen" && einladung}
      {offen === "geraet" && geraet}
    </div>
  );
}

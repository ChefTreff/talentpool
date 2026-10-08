"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Field } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import { SuchFeld } from "@/components/ui/SuchFeld";
import { listenAdresse } from "@/lib/personen/liste";

type Option = { value: string; label: string };
type Werte = { q: string; rolle: string; edition: string; konto: string; sort: string };

/**
 * Suche und Filter der Personenliste (ADM-091). Wie beim Protokoll gilt **jede
 * Auswahl sofort** und steht in der Adresszeile; die Suche wartet einen
 * Augenblick nach dem letzten Tastendruck, damit nicht jeder Buchstabe die
 * Liste neu lädt. Jede Änderung führt auf Seite 1 zurück.
 */
export function PersonenFilter({
  werte,
  rollen,
  editionen,
  konten,
  sortierungen,
  t,
}: {
  werte: Werte;
  rollen: Option[];
  editionen: Option[];
  konten: Option[];
  sortierungen: Option[];
  t: Record<string, string>;
}) {
  const router = useRouter();
  const pfad = usePathname();
  const [pending, start] = useTransition();
  const [suche, setSuche] = useState(werte.q);
  const warte = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gesendet = useRef(werte.q);

  // Ein Link „Filter zurücksetzen“ ändert die Adresse von aussen: das Feld folgt. Was wir selbst
  // abgeschickt haben, gilt nicht — sonst überschriebe die Antwort auf „ab“ das inzwischen getippte „abc“.
  useEffect(() => {
    if (werte.q !== gesendet.current) {
      gesendet.current = werte.q;
      setSuche(werte.q);
    }
  }, [werte.q]);
  useEffect(() => () => { if (warte.current) clearTimeout(warte.current); }, []);

  function setze(aenderung: Partial<Werte>) {
    // Eine Auswahl nimmt den eben getippten Suchtext mit, auch wenn der Zeitgeber noch läuft.
    const neu = { ...werte, q: suche.trim(), ...aenderung };
    gesendet.current = neu.q;
    start(() => router.replace(listenAdresse(pfad, neu)));
  }

  function beimTippen(wert: string) {
    setSuche(wert);
    if (warte.current) clearTimeout(warte.current);
    warte.current = setTimeout(() => setze({ q: wert.trim() }), 300);
  }

  const gefiltert = Boolean(werte.q || werte.rolle || werte.edition || werte.konto);

  return (
    <div className="mb-6 flex flex-col gap-4" aria-busy={pending || undefined}>
      <Field label={t.search} htmlFor="pers-q">
        <SuchFeld
          id="pers-q"
          value={suche}
          placeholder={t.searchPlaceholder}
          onChange={(e) => beimTippen(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (warte.current) clearTimeout(warte.current);
              setze({ q: suche.trim() });
            }
          }}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t.filterRole} htmlFor="pers-rolle">
          <Select id="pers-rolle" value={werte.rolle} placeholder={t.filterAll} options={rollen} onChange={(e) => setze({ rolle: e.target.value })} />
        </Field>
        <Field label={t.filterEdition} htmlFor="pers-edition">
          <Select id="pers-edition" value={werte.edition} placeholder={t.filterAll} options={editionen} onChange={(e) => setze({ edition: e.target.value })} />
        </Field>
        <Field label={t.filterAccount} htmlFor="pers-konto">
          <Select id="pers-konto" value={werte.konto} placeholder={t.accountActive} options={konten} onChange={(e) => setze({ konto: e.target.value })} />
        </Field>
        <Field label={t.sortBy} htmlFor="pers-sort">
          <Select id="pers-sort" value={werte.sort} options={sortierungen} onChange={(e) => setze({ sort: e.target.value })} />
        </Field>
      </div>
      {gefiltert && (
        <p>
          <Link className="ct-link ct-small" href={listenAdresse(pfad, { sort: werte.sort })}>
            {t.clearFilters}
          </Link>
        </p>
      )}
    </div>
  );
}

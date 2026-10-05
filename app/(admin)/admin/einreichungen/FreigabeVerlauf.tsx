"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import type { FreigabeArt, Verlaufszeile } from "@/lib/freigaben";
import { ladeFreigabeVerlauf } from "./actions";

type Strings = Record<string, string>;

/**
 * „Bereits freigegeben“ unter den offenen Einträgen eines Reiters (ADM-081 Teil 2): was schon entschieden ist, mit
 * Datum und der Person, die entschieden hat, zuletzt zuerst, in Seiten.
 *
 * **Geladen wird erst beim Aufklappen.** Die Seite zeigt den Verlauf in einem `Block` (`<details>`); der Inhalt
 * steckt von Anfang an im Dokument, also hängt sich diese Komponente an das `toggle`-Ereignis ihres Blocks und holt
 * die erste Seite, sobald er zum ersten Mal offen ist (oder schon offen ankommt, etwa über den Anker
 * `#bereits-freigegeben`). Wer ihn nie aufklappt, löst keinen Aufruf aus.
 *
 * „Mehr laden“ schickt Zeitpunkt und Kennung der letzten Zeile zurück — als die Zeichenketten, die die Datenbank
 * geliefert hat. Über `Date` liefe der Zeitpunkt durch Millisekunden und verlöre Mikrosekunden; Zeilen mit fast
 * gleichem Zeitpunkt kämen doppelt oder gar nicht.
 */
export function FreigabeVerlauf({
  art,
  dateLocale,
  t,
  rpcMessages,
}: {
  art: FreigabeArt;
  dateLocale: string;
  t: Strings;
  rpcMessages: Record<string, string>;
}) {
  const [zeilen, setZeilen] = useState<Verlaufszeile[]>([]);
  const [hatMehr, setHatMehr] = useState(false);
  const [geladen, setGeladen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const wurzel = useRef<HTMLDivElement | null>(null);
  const gestartet = useRef(false);

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;

  function seite(von: { at: string; id: string } | null) {
    startTransition(async () => {
      setFehler(null);
      try {
        const res = await ladeFreigabeVerlauf(art, von);
        if (!res.ok) {
          setFehler(message(res.key));
          return;
        }
        setZeilen((alt) => (von ? [...alt, ...res.zeilen] : res.zeilen));
        setHatMehr(res.hatMehr);
        setGeladen(true);
      } catch {
        // Auch ein Abbruch der Server-Action (etwa abgelaufene Sitzung) endet in einer Meldung, nicht im Leeren.
        setFehler(message("unknown"));
      }
    });
  }

  useEffect(() => {
    const block = wurzel.current?.closest("details");
    if (!block) return;
    const laden = () => {
      if (block.open && !gestartet.current) {
        gestartet.current = true;
        seite(null);
      }
    };
    block.addEventListener("toggle", laden);
    laden();
    return () => block.removeEventListener("toggle", laden);
    // Einmal je Einhängen: `art` wechselt nie, die Seite setzt die Komponente über `key` zurück.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const letzte = zeilen[zeilen.length - 1];
  const weiter = letzte ? { at: letzte.entschieden_am, id: letzte.objekt_id } : null;

  return (
    <div ref={wurzel}>
      {fehler && (
        <p role="alert" className="ct-help text-error-ink">
          {fehler}
        </p>
      )}
      {!geladen && !fehler && (
        <p role="status" className="ct-help">
          {t.loading}
        </p>
      )}
      {geladen && zeilen.length === 0 && (
        <p role="status" className="ct-help">
          {t.empty}
        </p>
      )}
      {zeilen.length > 0 && <VerlaufListe zeilen={zeilen} dateLocale={dateLocale} t={t} />}
      {/* Nach einem Fehler dieselbe Seite noch einmal: `weiter` ist die letzte geladene Zeile — oder leer, wenn schon die
          erste Seite scheiterte. */}
      {(hatMehr || fehler) && (
        <div className="mt-2">
          <Button variant="secondary" size="sm" disabled={pending} onClick={() => seite(weiter)}>
            {fehler ? t.retry : t.loadMore}
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Die Liste selbst — reine Darstellung, ohne Laden: so lässt sie sich mit Beispieldaten ansehen. Eine Zeile trägt
 * Titel und Zeitpunkt, darunter Detail, Betrag und Termin (was die Art hergibt), darunter wer entschieden hat und
 * die Notiz. Beträge und Zeiten formatiert die Seite in der Sprache des Admins, nicht die Datenbank.
 */
export function VerlaufListe({ zeilen, dateLocale, t }: { zeilen: Verlaufszeile[]; dateLocale: string; t: Strings }) {
  const datum = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium", timeStyle: "short" });
  const geld = new Intl.NumberFormat(dateLocale, { style: "currency", currency: "EUR" });
  return (
    <ul className="flex flex-col">
      {zeilen.map((z) => {
        const zusatz = [
          z.detail,
          z.betrag_cents !== null ? geld.format(z.betrag_cents / 100) : null,
          z.termin ? datum.format(new Date(z.termin)) : null,
        ].filter(Boolean);
        return (
          <li key={`${z.objekt_id}|${z.entschieden_am}`} className="flex flex-col gap-0.5 border-t py-3 first:border-t-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
              <span className="ct-label text-ink">{z.titel}</span>
              <span className="ct-help">{datum.format(new Date(z.entschieden_am))}</span>
            </div>
            {zusatz.length > 0 && <p className="ct-help">{zusatz.join(" · ")}</p>}
            <p className="ct-help">
              {t.decidedBy} {z.entschieden_von ?? t.unknownDecider}
              {z.notiz ? ` · ${z.notiz}` : ""}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

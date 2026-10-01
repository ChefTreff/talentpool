"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  fremdeSchluessel,
  MAX_GESPEICHERT,
  speicherSchluessel,
  verlaufFuerServer,
  zuegeLesen,
  type Zug,
} from "@/lib/wiki/gespraech";
import type { Quelle } from "@/lib/wiki/assistent";

type Stand = {
  zuege: Zug[];
  laeuft: boolean;
  /** Wechselt mit „Neues Gespräch" — eine Antwort auf ein altes kommt nicht ins neue. */
  lauf: number;
};

const LEER: Stand = { zuege: [], laeuft: false, lauf: 0 };

/**
 * Ein Speicher für alle Ansichten eines Tabs: Die Bubble und die Karte auf der
 * Wiki-Seite zeigen **dasselbe** Gespräch. Wer auf der Wiki-Seite fragt und
 * danach auf der Checkliste die Bubble öffnet, macht dort weiter.
 */
const staende = new Map<string, Stand>();
const hoerer = new Map<string, Set<() => void>>();

/** `sessionStorage` kann fehlen oder werfen (privates Fenster, gesperrt). Dann bleibt das Gespräch im Speicher der Seite. */
function speicher(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function lesen(schluessel: string): Stand {
  const da = staende.get(schluessel);
  if (da) return da;
  let zuege: Zug[] = [];
  try {
    const roh = speicher()?.getItem(schluessel);
    if (roh) zuege = zuegeLesen(JSON.parse(roh));
  } catch {
    // Kaputter Eintrag: neues Gespräch statt Fehlerseite.
  }
  const stand: Stand = { zuege, laeuft: false, lauf: 0 };
  staende.set(schluessel, stand);
  return stand;
}

function setzen(schluessel: string, stand: Stand) {
  staende.set(schluessel, stand);
  try {
    const s = speicher();
    if (stand.zuege.length === 0) s?.removeItem(schluessel);
    else s?.setItem(schluessel, JSON.stringify(stand.zuege));
  } catch {
    // Voll oder gesperrt: dann hält das Gespräch nur bis zum Neuladen.
  }
  for (const h of hoerer.get(schluessel) ?? []) h();
}

function abonnieren(schluessel: string, h: () => void) {
  let menge = hoerer.get(schluessel);
  if (!menge) hoerer.set(schluessel, (menge = new Set()));
  menge.add(h);
  return () => {
    menge.delete(h);
  };
}

/** Gespräche anderer Konten aus diesem Tab entfernen (siehe `speicherSchluessel`). */
function aufraeumen(besitzer: string) {
  try {
    const s = speicher();
    if (!s) return;
    const alle = Array.from({ length: s.length }, (_, i) => s.key(i) ?? "");
    for (const k of fremdeSchluessel(alle, besitzer)) s.removeItem(k);
  } catch {
    // Nichts zu retten — dann bleibt es liegen, bis der Tab schließt.
  }
}

type Antwort = {
  hit?: boolean;
  answer?: string | null;
  sources?: Quelle[];
  error?: string;
};

/**
 * Das Gespräch einer Zielgruppe mit Chefi (ADM-044).
 *
 * Gefragt wird mit dem ganzen bisherigen Verlauf; der Server sucht trotzdem bei
 * jeder Frage neu und nur in den Artikeln, die die Person lesen darf. Die
 * Antwort landet im gemeinsamen Speicher, auch wenn die Ansicht, aus der
 * gefragt wurde, inzwischen zu ist.
 */
export function useGespraech({
  besitzer,
  zielgruppe,
  sprache,
  nichtsText,
}: {
  /** Wessen Gespräch: die Kennung des Kontos. */
  besitzer: string;
  zielgruppe: string;
  sprache: string;
  /** Der Satz, den die Seite bei „nichts im Wiki" zeigt — so geht er auch in den Verlauf. */
  nichtsText: string;
}) {
  const schluessel = speicherSchluessel(besitzer, zielgruppe);
  const abo = useCallback((h: () => void) => abonnieren(schluessel, h), [schluessel]);
  const stand = useSyncExternalStore(
    abo,
    () => lesen(schluessel),
    () => LEER,
  );

  useEffect(() => aufraeumen(besitzer), [besitzer]);

  const fragen = useCallback(
    async (eingabe: string) => {
      const frage = eingabe.trim();
      const vorher = lesen(schluessel);
      if (!frage || vorher.laeuft) return;

      const lauf = vorher.lauf;
      const mitFrage: Zug[] = [...vorher.zuege, { art: "frage", text: frage }];
      setzen(schluessel, { zuege: mitFrage.slice(-MAX_GESPEICHERT), laeuft: true, lauf });

      let antwort: Zug;
      try {
        const res = await fetch("/api/wiki/frage", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            messages: verlaufFuerServer(vorher.zuege, frage, nichtsText),
            audience: zielgruppe,
            language: sprache,
          }),
        });
        // Keine JSON-Antwort heißt: etwas anderes hat geantwortet — meist die
        // Anmeldeseite, auf die eine abgelaufene Sitzung umleitet. Das ist ein
        // Fehler und kein „steht nicht im Wiki".
        const json = (await res.json().catch(() => null)) as Antwort | null;
        if (!res.ok || res.redirected || !json) antwort = { art: "hinweis", schluessel: json?.error ?? "unknown" };
        else if (!json.hit) antwort = { art: "nichts" };
        else if (json.answer) antwort = { art: "antwort", text: json.answer, quellen: json.sources ?? [] };
        else antwort = { art: "abschnitte", quellen: json.sources ?? [] };
      } catch {
        antwort = { art: "hinweis", schluessel: "unknown" };
      }

      const jetzt = lesen(schluessel);
      if (jetzt.lauf !== lauf) return;
      setzen(schluessel, {
        zuege: [...jetzt.zuege, antwort].slice(-MAX_GESPEICHERT),
        laeuft: false,
        lauf,
      });
    },
    [schluessel, zielgruppe, sprache, nichtsText],
  );

  const neu = useCallback(() => {
    const jetzt = lesen(schluessel);
    setzen(schluessel, { zuege: [], laeuft: false, lauf: jetzt.lauf + 1 });
  }, [schluessel]);

  return { zuege: stand.zuege, laeuft: stand.laeuft, fragen, neu };
}

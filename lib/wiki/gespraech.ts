/**
 * Das Gespräch mit Chefi im Browser (ADM-044) — die Teile ohne Browser.
 *
 * Konrad (25.09.): ein Assistent, der sich wie ein Chat verhält, zusammenhängend,
 * mit Gedächtnis bis zum Neustart. Der Verlauf lebt deshalb **nur im Browser**,
 * im `sessionStorage` des Tabs: Er übersteht das Blättern zwischen den Seiten
 * und ein Neuladen, endet mit dem Tab oder mit „Neues Gespräch" und liegt nie
 * in der Datenbank.
 *
 * Bewusst ohne "use client": Lesen, Prüfen und Kürzen gehören in Tests. Den
 * Speicher selbst bedient `components/wiki/useGespraech.ts`.
 */
import {
  MAX_ANTWORT_ZEICHEN,
  MAX_ZUEGE,
  type Nachricht,
} from "@/lib/speaker/titel-assistent";
import { MAX_FRAGE_ZEICHEN, type Quelle } from "@/lib/wiki/assistent";

/** Ein Zug, wie die Seite ihn zeigt. */
export type Zug =
  | { art: "frage"; text: string }
  | { art: "antwort"; text: string; quellen: Quelle[] }
  /** Kein Modell hinterlegt: nur die passenden Artikel. */
  | { art: "abschnitte"; quellen: Quelle[] }
  /** Dazu steht nichts im Wiki. */
  | { art: "nichts" }
  /** Etwas hat nicht geklappt (Limit, Netz). Gehört nicht zum Verlauf. */
  | { art: "hinweis"; schluessel: string };

/** So viele Züge hebt der Tab auf; ans Modell gehen davon höchstens `MAX_ZUEGE`. */
export const MAX_GESPEICHERT = 40;

const PRAEFIX = "chefi:v1:";

/**
 * Unter welchem Schlüssel ein Gespräch liegt: je Konto und Zielgruppe.
 *
 * **Je Konto**, weil ein Tab das Abmelden überlebt — wer sich danach am selben
 * Rechner anmeldet, soll das Gespräch davor nicht sehen. **Je Zielgruppe**, weil
 * die Antworten im Partner-Portal aus Partner-Artikeln stammen: Wer mit
 * beiden Rollen zwischen den Portalen wechselt, nimmt sie nicht in das andere
 * Gespräch mit.
 */
export function speicherSchluessel(besitzer: string, zielgruppe: string): string {
  return `${PRAEFIX}${besitzer}:${zielgruppe}`;
}

/** Schlüssel anderer Konten im selben Tab — die räumt die Seite weg. */
export function fremdeSchluessel(alle: readonly string[], besitzer: string): string[] {
  const eigene = `${PRAEFIX}${besitzer}:`;
  return alle.filter((k) => k.startsWith("chefi:") && !k.startsWith(eigene));
}

function istQuelle(q: unknown): q is Quelle {
  const x = q as Quelle | null;
  return (
    typeof x?.slug === "string" &&
    typeof x.title === "string" &&
    (x.heading === null || typeof x.heading === "string")
  );
}

function quellenLesen(roh: unknown): Quelle[] {
  return Array.isArray(roh) ? roh.filter(istQuelle).slice(0, 12) : [];
}

/**
 * Den gespeicherten Verlauf lesen. Was im Speicher steht, kann jeder im Tab
 * ändern; was nicht passt, fällt weg, statt die Seite zu stören.
 */
export function zuegeLesen(roh: unknown): Zug[] {
  if (!Array.isArray(roh)) return [];
  const raus: Zug[] = [];
  for (const z of roh) {
    const x = z as Record<string, unknown> | null;
    switch (x?.art) {
      case "frage":
        if (typeof x.text === "string" && x.text.trim() && x.text.length <= MAX_FRAGE_ZEICHEN)
          raus.push({ art: "frage", text: x.text });
        break;
      case "antwort":
        if (typeof x.text === "string" && x.text.trim() && x.text.length <= MAX_ANTWORT_ZEICHEN)
          raus.push({ art: "antwort", text: x.text, quellen: quellenLesen(x.quellen) });
        break;
      case "abschnitte":
        raus.push({ art: "abschnitte", quellen: quellenLesen(x.quellen) });
        break;
      case "nichts":
        raus.push({ art: "nichts" });
        break;
      case "hinweis":
        if (typeof x.schluessel === "string") raus.push({ art: "hinweis", schluessel: x.schluessel });
        break;
    }
  }
  return raus.slice(-MAX_GESPEICHERT);
}

/**
 * Was vom Gespräch an den Server geht, zusammen mit der neuen Frage.
 *
 * Fragen werden Züge des Menschen, Antworten Züge des Assistenten; „nichts im
 * Wiki" geht als der Satz mit, den die Seite gezeigt hat. Eine Frage, auf die
 * nur ein Hinweis kam (Limit, Netz), fällt mit ihm weg — sie wurde nie
 * beantwortet und käme sonst beim nächsten Versuch doppelt an. Gekürzt wird
 * auf `MAX_ZUEGE`; dass der Verlauf mit dem Menschen beginnt, stellt der Server
 * sicher (`verlaufKuerzen`).
 */
export function verlaufFuerServer(zuege: Zug[], neueFrage: string, nichtsText: string): Nachricht[] {
  const verlauf: Nachricht[] = [];
  for (const z of zuege) {
    if (z.art === "frage") verlauf.push({ role: "user", content: z.text });
    else if (z.art === "antwort") verlauf.push({ role: "assistant", content: z.text });
    else if (z.art === "nichts") verlauf.push({ role: "assistant", content: nichtsText });
    else if (z.art === "hinweis" && verlauf[verlauf.length - 1]?.role === "user") verlauf.pop();
  }
  verlauf.push({ role: "user", content: neueFrage });
  return verlauf.slice(-MAX_ZUEGE);
}

/**
 * Ist der Assistent in der Liste der Wiki-Seite aufgeklappt? (K-92, Konrad 09.10.2026)
 *
 * Zugeklappt, solange nichts läuft — dann stehen Suche und Themen am Handy im ersten Bild. **Aufgeklappt, solange ein Gespräch
 * da ist** (es steht im Tab, `useGespraech`): wer nachgefragt hat, findet es wieder. **Hat die Person von Hand auf- oder
 * zugeklappt (`gewaehlt`), gilt das** — auch wenn danach ein Gespräch entsteht oder endet.
 */
export const assistentOffen = (gewaehlt: boolean | null, zuege: number): boolean => gewaehlt ?? zuege > 0;

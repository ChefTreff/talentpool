import type { EureDatenEntwurf } from "@/components/partner/EureDaten";

/**
 * Die vier Abschnitte von „Eure Daten“ und wie weit jeder ist (PART-106, Konrad 08.10.2026, K-73): **unabhängige Bereiche mit
 * Stand**, keine Stationen eines Ablaufs. Rechnungsdaten kann man vor der Beschreibung ausfüllen, und der Haken kommt aus dem
 * Inhalt, nicht aus der Position. Alles wird aus dem **Entwurf** gelesen, nicht aus dem Gespeicherten — Marken und Zahl stimmen
 * damit schon beim Tippen, wie vorher die Haken der `StepBar`.
 *
 * Ohne React, damit die Tests es ausführen.
 */

export const BLOCK_IDS = ["unternehmen", "beschreibung", "logo", "rechnung"] as const;
export type BlockId = (typeof BLOCK_IDS)[number];

type Feld = keyof EureDatenEntwurf;

/**
 * Welche Felder ausgefüllt sein müssen, damit ein Abschnitt „fertig“ ist — dieselben Regeln wie die Haken vorher und wie die
 * Zeile „Zum Abschluss fehlt noch“. Das Logo ist keine Frage des Entwurfs, sondern der hochgeladenen Dateien.
 */
const PFLICHT: Record<"unternehmen" | "beschreibung" | "rechnung", Feld[]> = {
  unternehmen: ["legal_name", "communication_name", "address_street", "address_zip", "address_city"],
  beschreibung: ["description_de"],
  rechnung: ["invoice_email"],
};

export type BlockStand = {
  id: BlockId;
  fertig: boolean;
  /** Die Felder, die noch fehlen (Schlüssel des Entwurfs); beim Logo leer — dort zählen die Dateien. */
  fehlt: Feld[];
  /** Nur beim Logo: wie viele der Dateien da sind. */
  teile?: { da: number; gesamt: number };
};

export function blockStaende(draft: EureDatenEntwurf, logos: { da: number; gesamt: number }): BlockStand[] {
  const feldBlock = (id: keyof typeof PFLICHT): BlockStand => {
    const fehlt = PFLICHT[id].filter((k) => !draft[k].trim());
    return { id, fertig: fehlt.length === 0, fehlt };
  };
  return [
    feldBlock("unternehmen"),
    feldBlock("beschreibung"),
    // Ohne Pflicht dahinter (die Vorlage fehlt) kann das Logo nicht „fertig“ sein.
    { id: "logo", fertig: logos.gesamt > 0 && logos.da === logos.gesamt, fehlt: [], teile: logos },
    feldBlock("rechnung"),
  ];
}

export const anzahlFertig = (staende: BlockStand[]) => staende.filter((s) => s.fertig).length;

/** Der Abschnitt, der beim Laden offen steht: der erste, der noch etwas braucht. Ist alles da, bleibt alles zu. */
export function ersterOffener(staende: BlockStand[]): BlockId | null {
  return staende.find((s) => !s.fertig)?.id ?? null;
}

/**
 * Ob der Entwurf von dem abweicht, was gespeichert ist. Beide Seiten gehen durch dieselbe Aufbereitung wie beim Speichern
 * (`speicherDaten`), sonst bliebe die Leiste nach dem Speichern stehen: eine „abweichende Firmierung“, die dem Firmennamen
 * gleicht, wird leer gespeichert und käme leer zurück.
 */
export function weichtAb(a: Record<string, string>, b: Record<string, string>): boolean {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].some((k) => a[k] !== b[k]);
}

/** Die Texte der Kurzfassungen und was fehlt — aus dem Wörterbuch der Seite. */
export type KurzTexte = {
  /** „Es fehlt: {liste}“ */
  fehlt: string;
  /** „{n} Zeichen“ */
  zeichen: string;
  /** „Branche {name}“ */
  branche: string;
  /** „{format} da“ */
  logoDa: string;
  /** „{format} fehlt“ */
  logoFehlt: string;
};

export type KurzQuelle = {
  draft: EureDatenEntwurf;
  /** Beschriftung je Feld des Entwurfs, für „Es fehlt: …“. */
  feldNamen: Partial<Record<Feld, string>>;
  /** Je Logo-Datei: ihr Format und ob sie da ist. */
  logos: { format: string; da: boolean }[];
  /** Vokabular `industry`: Schlüssel → Anzeigename. */
  branchen: Record<string, string>;
};

/**
 * **Eine Zeile für den zugeklappten Abschnitt:** was drinsteht („Muster GmbH · Musterstraße 1, 80331 München“) oder was
 * fehlt („Es fehlt: Straße · PLZ“) — so zeigt schon die Liste, wo man steht. `undefined`, wo es nichts zu sagen gibt (kein
 * Logo-Upload gebucht).
 */
export function kurzfassung(stand: BlockStand, q: KurzQuelle, t: KurzTexte): string | undefined {
  const { draft } = q;
  const fehlt = () => t.fehlt.replace("{liste}", stand.fehlt.map((k) => q.feldNamen[k] ?? k).join(" · "));

  if (stand.id === "logo") {
    if (q.logos.length === 0) return undefined;
    return q.logos.map((l) => (l.da ? t.logoDa : t.logoFehlt).replace("{format}", l.format)).join(" · ");
  }
  if (!stand.fertig) return fehlt();

  switch (stand.id) {
    case "unternehmen": {
      const name = draft.communication_name.trim() || draft.legal_name.trim();
      return `${name} · ${draft.address_street.trim()}, ${draft.address_zip.trim()} ${draft.address_city.trim()}`;
    }
    case "beschreibung": {
      const zeichen = t.zeichen.replace("{n}", String(draft.description_de.trim().length));
      const branche = q.branchen[draft.industry];
      return branche ? `${zeichen} · ${t.branche.replace("{name}", branche)}` : zeichen;
    }
    case "rechnung":
      return draft.invoice_email.trim();
  }
}

/**
 * Die Marke des Abschnitts in Wort **und** Ton (Regel 4): Fertig (grün), Offen (gelb) — beim Logo „1 von 2“ (gelb), sobald
 * eine Datei da ist.
 */
export function marke(
  stand: BlockStand,
  t: { fertig: string; offen: string; anzahl: string },
): { text: string; ton: "success" | "warning" } {
  if (stand.fertig) return { text: t.fertig, ton: "success" };
  if (stand.teile && stand.teile.da > 0) {
    return { text: t.anzahl.replace("{n}", String(stand.teile.da)).replace("{total}", String(stand.teile.gesamt)), ton: "warning" };
  }
  return { text: t.offen, ton: "warning" };
}

/**
 * Was insgesamt fehlt, in der Reihenfolge der Seite (Unternehmen, Beschreibung, Logo, Rechnungsdaten) — die Zeile „Zum
 * Abschluss fehlt noch“ unter der Zahl. Das Logo steht als Wort „Logo“, nicht je Datei; die Dateien nennt der Abschnitt.
 */
export function gesamtFehlt(staende: BlockStand[], feldNamen: Partial<Record<Feld, string>>, logoName: string): string[] {
  return staende.flatMap((s) => (s.id === "logo" ? (s.fertig ? [] : [logoName]) : s.fehlt.map((k) => feldNamen[k] ?? k)));
}

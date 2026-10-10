/**
 * Tischvorgabe der Bewerbungsfragen (PART-150, Plan-Entscheidung 09.10.2026) — die reinen Regeln hinter der Karte „Tischvorgabe“ unter
 * `/partner/interview-tables/fragen`.
 *
 * Ein Tisch hat leicht zwanzig Gespräche, und die Fragen hängen je Gespräch an `session_question`. Die Vorgabe ist **das erste Gespräch des Tisches** (frühester
 * Beginn, dann Id) und wird nur abgeleitet — nichts wird gespeichert. Die Karte bearbeitet die Fragen dieses Gesprächs mit den bestehenden Funktionen, und
 * `partner_copy_table_questions` übernimmt sie auf die übrigen Gespräche; fällt das erste Gespräch weg (abgesagt), rückt das nächste nach. Ob ein Gespräch
 * „abweichend von der Tischvorgabe“ ist, sagt der Vergleich der Fragensätze, nicht ein Merker.
 */

/** Was ein Gespräch mitbringen muss, damit die Vorgabe feststeht (`partner_format_sessions`). */
export type TischGespraech = { id: string; starts_at: string | null };

/** Beginn als Zahl; ein fehlender oder unlesbarer Beginn kommt zuletzt. */
function beginn(g: TischGespraech): number {
  const t = g.starts_at ? Date.parse(g.starts_at) : NaN;
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

/** Die Reihenfolge am Tisch: frühester Beginn zuerst, bei gleichem Beginn die kleinere Id — dieselbe Reihenfolge für Vorgabe und Liste. */
export function amTischGeordnet<T extends TischGespraech>(gespraeche: readonly T[]): T[] {
  return [...gespraeche].sort((a, b) => {
    const d = beginn(a) - beginn(b);
    if (d !== 0 && !Number.isNaN(d)) return d;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** Das erste Gespräch des Tisches ist die Vorgabe; ohne Gespräch gibt es keine. */
export function vorgabeGespraech<T extends TischGespraech>(gespraeche: readonly T[]): T | undefined {
  return amTischGeordnet(gespraeche)[0];
}

/** Was von einer Frage für den Vergleich zählt: alle Inhaltsfelder (wie die Gleichheit in `partner_copy_table_questions`). */
export type FrageFuerSatz = {
  question_id: string | null;
  label_de: string;
  label_en: string;
  type: string | null;
  options?: unknown;
  purpose: string | null;
};

/**
 * Der Fragensatz eines Gesprächs als eine Zeichenkette zum Vergleichen: die **Katalogwahl** (nur wählbare Fragen, nach Kennung geordnet) und die **eigenen
 * Fragen** (nach Inhalt geordnet, alle Inhaltsfelder). Nicht dabei: die Fragen des Teams, Pflicht, Reihenfolge und Freigabestatus — das ändert die
 * Übernahme nicht, ein Gespräch weicht also nicht ab, weil es anders geordnet ist oder eine Frage noch auf die Freigabe wartet.
 */
export function fragenSatz(fragen: readonly FrageFuerSatz[], waehlbar: ReadonlySet<string>): string {
  const katalog = fragen
    .filter((f) => f.question_id !== null && waehlbar.has(f.question_id))
    .map((f) => f.question_id as string)
    .sort();
  const eigene = fragen
    .filter((f) => f.question_id === null)
    .map((f) => JSON.stringify([f.label_de, f.label_en, f.type, f.options ?? null, f.purpose]))
    .sort();
  return JSON.stringify([katalog, eigene]);
}

/** Eine Zeile der Gesprächsliste: das Gespräch, ob es die Vorgabe ist, und ob es von ihr abweicht (die Vorgabe selbst nie). */
export type TischZeile<T> = { gespraech: T; istVorgabe: boolean; abweichend: boolean };

/**
 * Der Stand eines Tisches: die Vorgabe, die Zeilen in der Reihenfolge am Tisch und die **Ziele** der Übernahme (alle Gespräche außer der Vorgabe).
 * `satzJe` liefert den Fragensatz eines Gesprächs (`fragenSatz`).
 */
export function tischStand<T extends TischGespraech>(
  gespraeche: readonly T[],
  satzJe: (g: T) => string,
): { vorgabe: T | undefined; zeilen: TischZeile<T>[]; ziele: T[] } {
  const geordnet = amTischGeordnet(gespraeche);
  const vorgabe = geordnet[0];
  const vorgabeSatz = vorgabe ? satzJe(vorgabe) : null;
  const zeilen = geordnet.map((g) => ({
    gespraech: g,
    istVorgabe: g === vorgabe,
    abweichend: g !== vorgabe && satzJe(g) !== vorgabeSatz,
  }));
  return { vorgabe, zeilen, ziele: geordnet.slice(1) };
}

/**
 * Die Meldung zu einem Fehler der Übernahme: der Text des Schlüssels aus `messages.rpc`, und nennt der Fehler ein Gespräch (`detail` bei `too_many_questions`
 * und `not_same_table`), steht dessen Titel dahinter — „Mehr als zwei eigene Fragen … (Gespräch: 10:30)“. Ein `detail`, das kein Gespräch dieses Tisches ist,
 * bleibt unerwähnt: die Meldung nennt nie eine fremde Kennung.
 */
export function uebernahmeFehler(
  res: { key: string; detail?: string },
  rpcMessages: Record<string, string>,
  titelJe: Record<string, string>,
  vorlage: string,
): string {
  const meldung = rpcMessages[res.key] ?? rpcMessages.unknown ?? res.key;
  const wo = res.detail ? titelJe[res.detail] : undefined;
  return wo ? vorlage.replace("{meldung}", meldung).replace("{gespraech}", wo) : meldung;
}

/** Was nach der Übernahme im Toast steht: null Gespräche geändert heißt „hatten die Vorgabe schon“, eins und mehrere je ihr Satz. */
export function uebernommenText(n: number, t: { vorgabeSame: string; vorgabeCopiedOne: string; vorgabeCopied: string }): string {
  if (n <= 0) return t.vorgabeSame;
  return n === 1 ? t.vorgabeCopiedOne : t.vorgabeCopied.replace("{n}", String(n));
}

/**
 * Freigabe im Admin, nach Tisch gebündelt (PART-150): ein Partner mit zwanzig Gesprächen an einem Tisch hat nach der Übernahme zwanzigmal dieselben offenen
 * eigenen Fragen. Das Team soll sie **einmal** lesen und für alle freigeben; die Freigabe selbst bleibt je Gespräch (`approve_session_questions`, ein
 * Audit je Gespräch wie bisher).
 */
export type OffeneFrage = {
  id: string;
  label_de: string;
  label_en?: string | null;
  type: string | null;
  options?: unknown;
  purpose: string | null;
};
export type OffenesGespraech = {
  sessionId: string;
  sessionTitle: string;
  stageId?: string | null;
  stageName?: string | null;
  fragen: OffeneFrage[];
};
export type FreigabeGruppe = {
  /** Beständiger Schlüssel der Gruppe (für `key`): Tisch und Inhalt der Fragen, bei einem Gespräch ohne Tisch dessen Id. */
  schluessel: string;
  sessionIds: string[];
  /** Ein Gespräch: sein Titel; mehrere: der Name des Tisches. */
  titel: string;
  fragen: OffeneFrage[];
};

/** Was an einer offenen Frage zählt, wenn „dieselbe Frage“ gemeint ist: alle Inhaltsfelder — wie die Gleichheit in `partner_copy_table_questions`. */
function inhalt(f: OffeneFrage): string {
  return JSON.stringify([f.label_de, f.label_en ?? null, f.type, f.options ?? null, f.purpose]);
}

/**
 * Gespräche **desselben Tisches** mit **denselben** offenen Fragen (alle Inhaltsfelder, Reihenfolge egal) bilden eine Gruppe; ein Gespräch ohne Tisch oder mit
 * anderen Fragen steht für sich. Die Reihenfolge der Gruppen ist die des ersten Gesprächs in der Liste; innerhalb der Gruppe bleibt die Reihenfolge der Liste.
 * Wer eine Gruppe freigibt, gibt genau das frei, was in ihr steht — `approve_session_questions` gibt alle offenen Fragen eines Gesprächs frei, und die Gruppe
 * fasst nur Gespräche zusammen, bei denen das dieselben sind.
 */
export function offeneFragenGruppieren(liste: readonly OffenesGespraech[]): FreigabeGruppe[] {
  const gruppen = new Map<string, FreigabeGruppe>();
  for (const g of liste) {
    const satz = JSON.stringify(g.fragen.map(inhalt).sort());
    const schluessel = g.stageId ? `${g.stageId}|${satz}` : `gespraech|${g.sessionId}`;
    const vorhanden = gruppen.get(schluessel);
    if (vorhanden) {
      vorhanden.sessionIds.push(g.sessionId);
      vorhanden.titel = g.stageName ?? vorhanden.titel;
    } else {
      gruppen.set(schluessel, { schluessel, sessionIds: [g.sessionId], titel: g.sessionTitle, fragen: g.fragen });
    }
  }
  return [...gruppen.values()];
}

import type { Deliverable, PartnerDeadline } from "@/app/(partner)/partner/types";

/**
 * Fristen und Aufgaben als **eine** Liste (PART-099, Konrad 05.10.: „die Fristen sind die
 * Deadlines der Aufgaben“).
 *
 * Eine Aufgabe (`deliverable`) bekommt ihre Frist aus der Frist der Edition (`deadline`): die
 * Vorlage der Aufgabe nennt sie in `due_rule.deadline_key`. Mehrere Aufgaben können an derselben
 * Frist hängen (Rückwand und digitales Branding an „Änderungen am Messestand“), und manche Fristen
 * hängen an gar keiner (die beiden Phasen des Messeshops). Beides zusammen ergibt die Regel:
 *
 *  - Jede Aufgabe trägt ihre Frist als Marke in der Zeile und ihren Text im Detail.
 *  - Jede Frist, an der **keine Aufgabe dieses Partners** hängt, bleibt eine eigene Zeile in
 *    derselben Liste. So geht keine Frist verloren, und keine steht doppelt da.
 *
 * Reine Funktionen ohne Browser und Datenbank, damit der Abgleich „nichts geht verloren“ im Test
 * läuft. Die Seiten lesen die Vorlagen (`deliverable_template`, für jede Anmeldung lesbar, nur
 * aktive Zeilen) und reichen sie hier herein.
 */

/** Der Teil einer Aufgabenvorlage, der die Frist bestimmt. */
export type Vorlage = {
  key: string;
  product_sku: string | null;
  due_rule: { deadline_key?: unknown; offset_days?: unknown } | null;
};

/** Eine Zeile der gemeinsamen Liste: eine Aufgabe oder eine Frist ohne Aufgabe. */
export type Zeile =
  | { art: "aufgabe"; aufgabe: Deliverable }
  | { art: "frist"; frist: PartnerDeadline };

/**
 * Die Kennung der Frist, an der eine Aufgabe hängt — `null`, wenn sie an keiner Frist der Edition
 * hängt (Regel `offset_days`, gar keine Regel) oder die Vorlagen sich nicht einig sind.
 *
 * Die Aufgabe kennt ihre Vorlage nur über `key` und `product_sku`, beide beim Anlegen aus der
 * Vorlage kopiert (`sync_deliverables`). Vier Rückwand-Vorlagen teilen sich den Schlüssel
 * `backdrop_print` und unterscheiden sich nur an der Leistung, deshalb zählt das Paar. Passt kein
 * Paar (die Leistung der Vorlage wurde nachträglich geändert), entscheidet der Schlüssel allein —
 * aber nur, wenn alle Vorlagen mit diesem Schlüssel dieselbe Frist nennen. Im Zweifel `null`: dann
 * bleibt die Frist als eigene Zeile stehen, und das ist die Seite, auf der man sich irren darf.
 */
export function fristKennungVon(
  aufgabe: Pick<Deliverable, "key" | "product_sku">,
  vorlagen: Vorlage[],
): string | null {
  const gleicherSchluessel = vorlagen.filter((v) => v.key === aufgabe.key);
  const passend = gleicherSchluessel.filter((v) => (v.product_sku ?? null) === (aufgabe.product_sku ?? null));
  const kandidaten = passend.length > 0 ? passend : gleicherSchluessel;
  const kennungen = new Set(kandidaten.map(kennungDerVorlage));
  if (kennungen.size !== 1) return null;
  return [...kennungen][0];
}

function kennungDerVorlage(v: Vorlage): string | null {
  const k = v.due_rule?.deadline_key;
  return typeof k === "string" && k.trim() !== "" ? k : null;
}

/** Die Fristen, die in der Liste vorkommen: nur die mit Datum — eine Frist ohne Datum sagt nichts. */
function mitDatum(fristen: PartnerDeadline[]): PartnerDeadline[] {
  return fristen.filter((f) => f.due_at);
}

export type Zuordnung = {
  /** Aufgabe (Kennung) → die Frist der Edition, an der sie hängt. Aufgaben ohne Frist der Edition fehlen. */
  fristVon: Record<string, PartnerDeadline>;
  /** Fristen mit Datum, an denen keine Aufgabe dieses Partners hängt — nach Datum, die frühesten zuerst. */
  ohneAufgabe: PartnerDeadline[];
};

/**
 * Welche Aufgabe hängt an welcher Frist, und welche Fristen bleiben übrig.
 * Jede Frist mit Datum steht danach **entweder** in `ohneAufgabe` **oder** an mindestens einer
 * Aufgabe in `fristVon` — nie in keinem von beiden, nie in beiden.
 */
export function ordneFristen(aufgaben: Deliverable[], fristen: PartnerDeadline[], vorlagen: Vorlage[]): Zuordnung {
  const verfuegbar = new Map(mitDatum(fristen).map((f) => [f.key, f]));
  const fristVon: Record<string, PartnerDeadline> = {};
  const getragen = new Set<string>();
  for (const a of aufgaben) {
    const kennung = fristKennungVon(a, vorlagen);
    const frist = kennung ? verfuegbar.get(kennung) : undefined;
    if (!frist) continue;
    fristVon[a.id] = frist;
    getragen.add(frist.key);
  }
  const ohneAufgabe = [...verfuegbar.values()]
    .filter((f) => !getragen.has(f.key))
    .sort((a, b) => a.due_at!.localeCompare(b.due_at!) || a.key.localeCompare(b.key));
  return { fristVon, ohneAufgabe };
}

const OFFEN = new Set(["open", "rejected", "overdue"]);

/**
 * Die nächsten Zeilen für die Übersicht: was noch zu tun ist (offen, zurückgewiesen, überfällig),
 * Zurückgewiesenes und Überfälliges zuerst, dann nach Frist, ohne Frist zuletzt. Fristen ohne
 * Aufgabe reihen sich nach ihrem Datum dazwischen — aber nur, solange sie bevorstehen: an einer
 * verstrichenen Frist ohne Aufgabe gibt es nichts mehr zu tun, sie steht dann nur noch auf der
 * Checkliste. Bei gleichem Datum kommt die Aufgabe vor der Frist: sie ist das, was man tun kann.
 */
export function naechsteZeilen(
  aufgaben: Deliverable[],
  ohneAufgabe: PartnerDeadline[],
  jetzt: number,
  anzahl: number,
): Zeile[] {
  type Eintrag = { zeile: Zeile; rang: number; datum: string; art: number; sort: number };
  const rang = (d: Deliverable) => (d.status === "rejected" ? 0 : d.status === "overdue" ? 1 : 2);
  const eintraege: Eintrag[] = [
    ...aufgaben
      .filter((d) => OFFEN.has(d.status))
      .map((d) => ({ zeile: { art: "aufgabe", aufgabe: d } as Zeile, rang: rang(d), datum: d.due_at ?? "9999", art: 0, sort: d.sort })),
    ...ohneAufgabe
      .filter((f) => f.due_at && new Date(f.due_at).getTime() > jetzt)
      .map((f) => ({ zeile: { art: "frist", frist: f } as Zeile, rang: 2, datum: f.due_at!, art: 1, sort: 0 })),
  ];
  return eintraege
    .sort((a, b) => a.rang - b.rang || a.datum.localeCompare(b.datum) || a.art - b.art || a.sort - b.sort)
    .slice(0, anzahl)
    .map((e) => e.zeile);
}

/**
 * Die nächste Frist für das Band der Übersicht: das früheste bevorstehende Datum unter allem, was
 * noch offen ist — offene Aufgaben mit Frist und Fristen ohne Aufgabe. Eine erledigte Aufgabe
 * zählt nicht mehr; sonst stünde im Band eine Frist, zu der die Liste darunter nichts mehr zeigt.
 * Der Titel ist der der Frist der Edition, sonst der der Aufgabe.
 */
export function naechsteFrist(
  aufgaben: Deliverable[],
  zuordnung: Zuordnung,
  jetzt: number,
  locale: string,
): { dueAt: string; titel: string } | null {
  const kandidaten: { dueAt: string; titel: string }[] = [];
  for (const a of aufgaben) {
    if (!OFFEN.has(a.status) || !a.due_at || new Date(a.due_at).getTime() <= jetzt) continue;
    const frist = zuordnung.fristVon[a.id];
    kandidaten.push({ dueAt: a.due_at, titel: frist ? fristTitel(frist, locale) : aufgabenTitel(a, locale) });
  }
  for (const f of zuordnung.ohneAufgabe) {
    if (new Date(f.due_at!).getTime() > jetzt) kandidaten.push({ dueAt: f.due_at!, titel: fristTitel(f, locale) });
  }
  kandidaten.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  return kandidaten[0] ?? null;
}

export function fristTitel(d: PartnerDeadline, locale: string): string {
  return (locale === "en" ? d.label_en : d.label_de) ?? d.label_de ?? d.key;
}

export function fristBeschreibung(d: PartnerDeadline, locale: string): string | null {
  const text = (locale === "en" ? d.description_en : d.description_de) ?? d.description_de ?? d.description_en;
  return text && text.trim() !== "" ? text : null;
}

function aufgabenTitel(a: Deliverable, locale: string): string {
  return (locale === "en" ? a.label_en : a.label_de) ?? a.label_de ?? a.key;
}

/**
 * Was die Frist der Edition dem Detail einer Aufgabe hinzufügt: ihr Text. Der steht sonst nur an
 * der Frist, und die gibt es in der gemeinsamen Liste nicht mehr als eigene Zeile. Hat sie keinen
 * Text, aber einen anderen Titel als die Aufgabe, steht der Titel da; sagt beides dasselbe wie die
 * Aufgabe, bleibt es bei der Marke.
 */
export function fristHinweis(frist: PartnerDeadline, aufgabe: Deliverable, locale: string): string | null {
  const text = fristBeschreibung(frist, locale);
  if (text) return text;
  const titel = fristTitel(frist, locale);
  return titel !== aufgabenTitel(aufgabe, locale) ? titel : null;
}

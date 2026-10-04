/**
 * „Meet us at“-Grafik für Partner (PART-096) — Maße, Anordnung und Texte, rein.
 *
 * Die Grafik entsteht im Browser auf einer Leinwand (wie die „Hear me speak“-
 * Grafik der Speaker): kein Fremddienst, nichts wird hochgeladen. Diese Datei
 * enthält alles, was sich ohne Browser berechnen und prüfen lässt — die
 * Anordnung je Format und Motiv, das Einpassen von Bildern und Texten, den
 * Dateinamen und die Datumszeile. Das Zeichnen selbst steht in
 * `meet-us-at-zeichnen.ts`.
 *
 * **Ein Entwurf, drei Formate.** Die Anordnung folgt der „Hear me speak“-
 * Vorlage (Wortmarke oben rechts, Überschrift unten links, Datum in der
 * Akzentschrift darunter, ein Bildfenster in der Mitte) und rechnet sich je
 * Format neu, statt drei Vorlagen vorzuhalten. Das spart die Pflege — ein neues
 * Jahr ändert zwei Wörterbuchzeilen und das Datum der Edition, keine Datei.
 */

/** Maße der drei Formate in Bildpunkten (Feed 1:1, Feed 4:5, Story 9:16). */
export const FORMATE = {
  quadrat: { breite: 1200, hoehe: 1200 },
  hochformat: { breite: 1080, hoehe: 1350 },
  story: { breite: 1080, hoehe: 1920 },
} as const;

export type FormatKey = keyof typeof FORMATE;
export const FORMAT_SCHLUESSEL = Object.keys(FORMATE) as FormatKey[];

/** Firmenlogo auf heller Fläche oder Person mit Porträt. */
export const VARIANTEN = ["logo", "person"] as const;
export type Variante = (typeof VARIANTEN)[number];

export type Rect = { x: number; y: number; w: number; h: number };

/**
 * Höhe zu Breite des Wortmarken-Blocks „FUTURE / LEADER / SUMMIT“ (drei Zeilen).
 * Er wird als Schrift gesetzt, nicht als Bild: `public/brand/fls-wortmarke.svg`
 * trägt das Wort „CLUB“ (die Wortmarke des Clubs), die Grafik braucht „SUMMIT“.
 */
export const WORTMARKE_ASPEKT = 611 / 895;

/**
 * Story-Sicherheitszonen: oben liegen Name und Fortschrittsbalken der
 * Plattform, unten das Antwortfeld. Was dort steht, verdeckt die Oberfläche.
 */
const STORY_OBEN = 250;
const STORY_UNTEN = 340;

export type Layout = {
  breite: number;
  hoehe: number;
  /** 1 bei 1200 Bildpunkten Breite — Strichstärken und Abstände skalieren damit. */
  u: number;
  rand: number;
  wortmarke: Rect;
  jahr: { xRechts: number; yBasis: number; groesse: number };
  kopf: { x: number; groesse: number; yBasis: [number, number]; oben: number; maxBreite: number };
  datum: { x: number; yBasis: number; groesse: number; maxBreite: number };
  /** Platz zwischen Wortmarke und Überschrift. */
  frei: Rect;
  /** Logo-Motiv: die helle Fläche und das Feld darin, in das das Logo passt. */
  plakette: Rect;
  logoFeld: Rect;
  /** Personen-Motiv: das Quadrat, in dem das Dreieck mit dem Porträt steht. */
  foto: Rect;
  /** Personen-Motiv: Name, Position und Firma, rechtsbündig unten. */
  person: { xRechts: number; yBasis: number; maxBreite: number; nameGroesse: number; zeileGroesse: number };
};

const gerundet = (n: number) => Math.round(n);

/**
 * Die Anordnung eines Formats. Alle Werte folgen der Breite, damit die
 * Schriftgrößen in jedem Format zusammenpassen; nur die Höhe entscheidet, wie
 * viel Platz die Mitte bekommt.
 */
export function layoutFuer(format: FormatKey): Layout {
  const { breite: W, hoehe: H } = FORMATE[format];
  const u = W / 1200;
  const rand = gerundet(0.055 * W);
  const oben = format === "story" ? STORY_OBEN : gerundet(0.05 * W);
  const unten = format === "story" ? STORY_UNTEN : gerundet(0.05 * W);

  const wm = gerundet(0.19 * W);
  const wortmarke: Rect = { x: W - rand - wm, y: oben, w: wm, h: gerundet(wm * WORTMARKE_ASPEKT) };

  const jahrGroesse = gerundet(0.042 * W);
  const jahr = {
    xRechts: W - rand,
    yBasis: wortmarke.y + wortmarke.h + gerundet(0.02 * W) + gerundet(0.72 * jahrGroesse),
    groesse: jahrGroesse,
  };

  // Unten links stehen Überschrift und Datum, unten rechts bei der Person Name und
  // Firma. Beide Seiten teilen sich die Breite, mit einem Abstand dazwischen.
  const person = {
    xRechts: W - rand,
    yBasis: H - unten,
    maxBreite: gerundet(0.4 * W),
    nameGroesse: gerundet(0.04 * W),
    zeileGroesse: gerundet(0.026 * W),
  };
  const linksMax = W - 2 * rand - person.maxBreite - gerundet(0.03 * W);

  const datumGroesse = gerundet(0.031 * W);
  const datum = { x: rand, yBasis: H - unten, groesse: datumGroesse, maxBreite: linksMax };

  const kopfGroesse = gerundet(0.092 * W);
  const zeile = gerundet(0.82 * kopfGroesse);
  const zweite = datum.yBasis - gerundet(0.047 * W);
  const kopf = {
    x: rand,
    groesse: kopfGroesse,
    yBasis: [zweite - zeile, zweite] as [number, number],
    oben: zweite - zeile - gerundet(0.72 * kopfGroesse),
    maxBreite: linksMax,
  };

  const freiOben = jahr.yBasis + gerundet(0.03 * W);
  const freiUnten = kopf.oben - gerundet(0.04 * W);
  const frei: Rect = { x: rand, y: freiOben, w: W - 2 * rand, h: freiUnten - freiOben };

  // Logo-Fläche: breiter als hoch, im hohen Format etwas gedrungener, damit die
  // Mitte nicht leer wirkt. Die Höhe begrenzt der freie Platz.
  const aspekt = format === "quadrat" ? 1.6 : format === "hochformat" ? 1.35 : 1.25;
  const pw = gerundet(0.68 * W);
  const ph = Math.min(frei.h, gerundet(pw / aspekt));
  const plakette: Rect = { x: gerundet((W - pw) / 2), y: gerundet(frei.y + (frei.h - ph) / 2), w: pw, h: ph };
  const polster = gerundet(0.1 * ph);
  const logoFeld: Rect = {
    x: plakette.x + polster,
    y: plakette.y + polster,
    w: plakette.w - 2 * polster,
    h: plakette.h - 2 * polster,
  };

  // Porträt-Dreieck: so groß wie der Platz bis zur Überschrift, aber nie breiter
  // als 86 % der Leinwand. Es darf bis auf die Höhe der Wortmarke hinaufreichen,
  // denn die Spitze ist schmal und stößt dort an nichts.
  const platz = freiUnten - oben;
  const kante = Math.min(platz, gerundet(0.86 * W));
  const foto: Rect = {
    x: gerundet((W - kante) / 2),
    y: oben + gerundet((platz - kante) / 2),
    w: kante,
    h: kante,
  };

  return { breite: W, hoehe: H, u, rand, wortmarke, jahr, kopf, datum, frei, plakette, logoFeld, foto, person };
}

/** Misst einen Text in Bildpunkten bei einer Schriftgröße (die Leinwand liefert es). */
export type Messer = (text: string, groesse: number) => number;

/**
 * Die größte Schriftgröße zwischen `start` und `min`, bei der der Text noch in
 * `maxBreite` passt. Passt er auch bei `min` nicht, gibt es `min` zurück — dann
 * kürzt `kuerzen`.
 */
export function schriftgroesseFuer(messe: Messer, text: string, maxBreite: number, start: number, min: number): number {
  let g = start;
  while (g > min && messe(text, g) > maxBreite) g = Math.max(min, Math.floor(g * 0.94));
  return g;
}

/** Kürzt einen Text mit „…“, bis er bei `groesse` in `maxBreite` passt. */
export function kuerzen(messe: Messer, text: string, maxBreite: number, groesse: number): string {
  if (messe(text, groesse) <= maxBreite) return text;
  let t = text.trimEnd();
  while (t.length > 1 && messe(`${t}…`, groesse) > maxBreite) t = t.slice(0, -1).trimEnd();
  return `${t}…`;
}

/**
 * Das Quellrechteck, mit dem ein Bild ein Zielfeld lückenlos füllt (cover). Ein
 * Querformat wird seitlich gekappt, mittig; ein Hochformat unten, damit der
 * Kopf stehen bleibt — dasselbe wie `object-top` an `PortraitShape`. Ein Bild
 * im Seitenverhältnis des Ziels (das Ergebnis des Zuschnitts) kommt unverändert
 * heraus. Ohne Maße gibt es ein leeres Rechteck, das nichts zeichnet.
 */
export function deckung(
  bildBreite: number,
  bildHoehe: number,
  zielBreite: number,
  zielHoehe: number,
): { sx: number; sy: number; sw: number; sh: number } {
  if (!(bildBreite > 0 && bildHoehe > 0 && zielBreite > 0 && zielHoehe > 0)) return { sx: 0, sy: 0, sw: 0, sh: 0 };
  const ziel = zielBreite / zielHoehe;
  if (bildBreite / bildHoehe > ziel) {
    const sw = bildHoehe * ziel;
    return { sx: (bildBreite - sw) / 2, sy: 0, sw, sh: bildHoehe };
  }
  return { sx: 0, sy: 0, sw: bildBreite, sh: bildBreite / ziel };
}

/**
 * Das Zielrechteck, in das ein Bild ganz hineinpasst (contain), mittig im Feld.
 * `faktor` verkleinert es weiter (0 < faktor ≤ 1); größer als das Feld wird es nie,
 * sonst schnitte das Logo seine eigenen Ränder ab.
 */
export function einpassen(bildBreite: number, bildHoehe: number, feld: Rect, faktor = 1): Rect {
  if (!(bildBreite > 0) || !(bildHoehe > 0)) return { x: feld.x, y: feld.y, w: 0, h: 0 };
  const f = Math.min(1, Math.max(0.1, faktor));
  const massstab = Math.min(feld.w / bildBreite, feld.h / bildHoehe) * f;
  const w = bildBreite * massstab;
  const h = bildHoehe * massstab;
  return { x: feld.x + (feld.w - w) / 2, y: feld.y + (feld.h - h) / 2, w, h };
}

/** `#rrggbb` mit Deckkraft als `rgba(...)`; andere Schreibweisen bleiben, wie sie sind. */
export function mitDeckkraft(farbe: string, deckkraft: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(farbe.trim());
  if (!m) return farbe;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.min(1, Math.max(0, deckkraft))})`;
}

/**
 * Datumszeile der Grafik: „16.–17. April 2027 | CCH Hamburg“ bzw.
 * „16–17 April 2027 | CCH Hamburg“. Die Tage stehen als Datum ohne Uhrzeit in
 * der Edition; sie werden in UTC formatiert, damit keine Zeitzone den Tag
 * verschiebt. Fehlt das Datum, steht nur der Ort.
 */
export function datumszeile(start: string | null, ende: string | null, locale: string, ort: string): string {
  const tag = (iso: string | null): Date | null => {
    const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
    return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
  };
  const von = tag(start);
  const bis = tag(ende) ?? von;
  if (!von || !bis) return ort;
  const fmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const zeitraum = von.getTime() === bis.getTime() ? fmt.format(von) : fmt.formatRange(von, bis);
  // Englisch setzt Leerzeichen um den Bindestrich („16 – 17 April“), je nach
  // ICU-Fassung schmale. Zwischen zwei Tagen derselben Woche gehört er eng
  // („16–17 April“); über einen Monatswechsel („30 April – 1 Mai“) bleibt er weit.
  return `${zeitraum.replace(/(\d\.?)[    ]*–[    ]*(?=\d)/, "$1–")} | ${ort}`;
}

/** Das Jahr der Veranstaltung für die Wortmarke („2027“); ohne Datum leer. */
export function jahrVon(start: string | null): string {
  const m = start ? /^(\d{4})-/.exec(start) : null;
  return m ? m[1] : "";
}

/** Kleinbuchstaben, Ziffern und Bindestriche — der Name landet im Download-Ordner. */
export function dateiteil(text: string): string {
  return text
    .normalize("NFKD")
    // Ohne diese Zeile wird aus „Müller“ ein „mu-ller“: die Zerlegung trennt den
    // Umlaut in „u“ und ein kombinierendes Trema, und das Trema fiele in den
    // nächsten Schritt (derselbe Fund wie bei der Speaker-Grafik, SPK-014).
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** `meet-us-at-<name>-<format>.png`, ohne Namen `meet-us-at-<format>.png`. */
export function dateiname(name: string, format: FormatKey, variante: Variante): string {
  const teil = dateiteil(name).slice(0, 48);
  const art = variante === "person" ? "person" : "logo";
  return ["meet-us-at", art, teil, format].filter(Boolean).join("-") + ".png";
}

/** Der Anfangsbuchstabe für das Dreieck ohne Porträt. */
export function initiale(name: string): string {
  return name.trim().charAt(0).toLocaleUpperCase() || "?";
}

import { csvCell } from "@/lib/csv";

/**
 * Bewerbungen als CSV für den Partner (PART-051, D3). Rein und ohne Server,
 * damit die Datei getestet werden kann — die Routen unter
 * `/partner/export/…` holen die Zeilen (`export_session_applications`,
 * `export_tour_applications`) und reichen sie hier durch.
 *
 * Aufbau: erste Zeile der DSGVO-Hinweis (`export_privacy_notice`), dann eine
 * Leerzeile, dann Kopf und Daten. Jede Zelle über `csvCell` (Formelschutz,
 * Regel vom 18.09.), Semikolon und BOM, damit Excel die Datei ohne
 * Import-Dialog öffnet.
 */

/** Antwort aus `export_tour_applications`: der Fragetext kommt mit, weil der Partner die Fragen der Tour nicht lesen kann. */
export type TourAntwort = { key: string; label_de: string; label_en: string; value: unknown };

/** Zeile aus `export_session_applications` bzw. `export_tour_applications`. */
export type ExportZeile = {
  bewerbung_id: string;
  name: string | null;
  email: string | null;
  linkedin: string | null;
  status: string;
  beworben_am: string | null;
  entschieden_am: string | null;
  bestaetigt_am: string | null;
  taetigkeit: string | null;
  karrierestufe: string | null;
  arbeitgeber: string | null;
  hochschule: string | null;
  studienfach: string | null;
  stadt: string | null;
  /** Format: `{schlüssel: wert}`; Tour: Liste mit Fragetext. */
  antworten: Record<string, unknown> | TourAntwort[] | null;
  /** Nur Tour (PART-092): vom Partner dieses Stopps gewünscht. */
  wunsch?: boolean;
};

export type ExportTexte = {
  kopf: {
    name: string;
    email: string;
    linkedin: string;
    status: string;
    /** Nur Tour: mit Text erscheint die Spalte „Euer Wunsch“ hinter dem Status. */
    wunsch?: string;
    beworben: string;
    entschieden: string;
    bestaetigt: string;
    taetigkeit: string;
    karrierestufe: string;
    arbeitgeber: string;
    hochschule: string;
    studienfach: string;
    stadt: string;
  };
  ja: string;
  nein: string;
};

/** „2027-04-16 14:30“ in der Zone des Summits — sortierbar, ohne Umrechnung in Excel. */
export function exportDatum(iso: string | null): string {
  if (!iso) return "";
  const text = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
  return text.replace(",", "");
}

/** Ein Antwortwert als Text: Listen mit Komma, Ja/Nein in der Sprache, Rest wie er ist. */
export function exportWert(wert: unknown, texte: Pick<ExportTexte, "ja" | "nein">): string {
  if (wert === null || wert === undefined) return "";
  if (Array.isArray(wert)) return wert.map((w) => exportWert(w, texte)).join(", ");
  if (typeof wert === "boolean") return wert ? texte.ja : texte.nein;
  if (wert === "true") return texte.ja;
  if (wert === "false") return texte.nein;
  if (typeof wert === "object") return JSON.stringify(wert);
  return String(wert);
}

type Antwort = { key: string; label: string; wert: unknown };

/**
 * Die Antworten einer Zeile mit Schlüssel und Fragetext. Format-Antworten
 * tragen nur den Schlüssel — der Text kommt aus `fragen` (Schlüssel → Text),
 * ein unbekannter Schlüssel steht für sich; Tour-Antworten bringen den Text mit.
 */
export function antwortenDerZeile(
  antworten: ExportZeile["antworten"],
  fragen: Map<string, string>,
  locale: string,
): Antwort[] {
  if (!antworten) return [];
  if (Array.isArray(antworten)) {
    return antworten.map((a) => ({ key: a.key, label: (locale === "en" ? a.label_en : a.label_de) || a.key, wert: a.value }));
  }
  return Object.entries(antworten).map(([key, wert]) => ({ key, label: fragen.get(key) ?? key, wert }));
}

/**
 * Die ganze Datei. Eine Spalte je beantworteter Frage, geschlüsselt über die
 * Frage (zwei Fragen mit gleichem Text bleiben zwei Spalten); `fragenReihenfolge`
 * (Schlüssel) legt die Reihenfolge vorn fest, Weiteres folgt in der Reihenfolge
 * des ersten Auftretens. Fragen ohne jede Antwort — etwa eine noch nicht
 * freigegebene eigene Frage — bekommen keine Spalte.
 */
export function bewerbungenCsv({
  hinweis,
  zeilen,
  fragen,
  fragenReihenfolge,
  statusLabels,
  vokabeln,
  locale,
  texte,
}: {
  hinweis: string;
  zeilen: ExportZeile[];
  fragen: Map<string, string>;
  fragenReihenfolge: string[];
  statusLabels: Record<string, string>;
  vokabeln: { occupation_status: Record<string, string>; career_level: Record<string, string>; study_field: Record<string, string> };
  locale: string;
  texte: ExportTexte;
}): string {
  const antworten = zeilen.map((z) => antwortenDerZeile(z.antworten, fragen, locale));
  const kopfText = new Map<string, string>();
  for (const reihe of antworten) for (const a of reihe) if (!kopfText.has(a.key)) kopfText.set(a.key, a.label);
  const schluessel = [
    ...fragenReihenfolge.filter((k) => kopfText.has(k)),
    ...[...kopfText.keys()].filter((k) => !fragenReihenfolge.includes(k)),
  ];

  const k = texte.kopf;
  const mitWunsch = Boolean(k.wunsch);
  const kopf = [k.name, k.email, k.linkedin, k.status, ...(mitWunsch ? [k.wunsch] : []),
    k.beworben, k.entschieden, k.bestaetigt, k.taetigkeit, k.karrierestufe, k.arbeitgeber, k.hochschule,
    k.studienfach, k.stadt, ...schluessel.map((s) => kopfText.get(s))];
  const daten = zeilen.map((z, i) => {
    const antwort = new Map(antworten[i].map((a) => [a.key, a.wert]));
    return [
      z.name, z.email, z.linkedin, statusLabels[z.status] ?? z.status,
      ...(mitWunsch ? [z.wunsch ? texte.ja : texte.nein] : []),
      exportDatum(z.beworben_am), exportDatum(z.entschieden_am), exportDatum(z.bestaetigt_am),
      z.taetigkeit ? vokabeln.occupation_status[z.taetigkeit] ?? z.taetigkeit : "",
      z.karrierestufe ? vokabeln.career_level[z.karrierestufe] ?? z.karrierestufe : "",
      z.arbeitgeber, z.hochschule,
      z.studienfach ? vokabeln.study_field[z.studienfach] ?? z.studienfach : "",
      z.stadt,
      ...schluessel.map((s) => exportWert(antwort.get(s), texte)),
    ];
  });
  const reihen: unknown[][] = [[hinweis], [], kopf, ...daten];
  return "\uFEFF" + reihen.map((r) => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
}

/** Dateiname nur aus Buchstaben, Ziffern und Bindestrich: „bewerbungen-test-masterclass-2026-09-26.csv“. */
export function exportDateiname(titel: string | null, heute: Date): string {
  const teil = (titel ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  const datum = exportDatum(heute.toISOString()).slice(0, 10);
  return `bewerbungen${teil ? `-${teil}` : ""}-${datum}.csv`;
}

/**
 * Merch-Konfiguration (S4, Entscheidung 14).
 *
 * Das Schema steht am Produkt (`product.merch_config`), die Antwort an der
 * Bestellzeile (`shop_order_line.merch_config`). Beides ist generisch: welche
 * Artikel 2027 angeboten werden, ist offen — ein neues Produkt mit gepflegtem
 * Schema soll genügen, ohne dass jemand Code anfasst.
 *
 * Dieselbe Prüfung läuft zweimal: hier im Browser, damit niemand eine halbe
 * Konfiguration in den Warenkorb legt, und noch einmal in `shop_confirm`
 * (P0001 `merch_incomplete`, `detail` = Feldschlüssel). Verlassen kann man
 * sich nur auf die RPC.
 */

export const MERCH_FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "select",
  "boolean",
  "date",
  /** Eine bereits hochgeladene Datei der Organisation (Logo). */
  "logo",
  /** Größenverteilung: Anzahl je Größe, Summe = Bestellmenge. */
  "sizes",
] as const;

export type MerchFieldType = (typeof MERCH_FIELD_TYPES)[number];

export type MerchField = {
  key: string;
  label_de: string | null;
  label_en: string | null;
  type: MerchFieldType;
  required: boolean;
  /** Werte für `select`, Größen für `sizes`. */
  options?: string[] | null;
  /** Nur `text`/`textarea`: Zeichengrenze für den Aufdruck. */
  max_length?: number | null;
};

/** Antwort einer Zeile: Feldschlüssel → Wert. `sizes` trägt ein Objekt. */
export type MerchValues = Record<string, string | number | boolean | Record<string, number>>;

export type MerchProblem =
  | { key: string; reason: "required" }
  | { key: string; reason: "too_long"; detail: string }
  | { key: string; reason: "not_an_option"; detail: string }
  | { key: string; reason: "sizes_sum"; detail: string };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function toField(raw: unknown): MerchField | null {
  if (!isRecord(raw)) return null;
  const key = typeof raw.key === "string" ? raw.key.trim() : "";
  if (key === "") return null;
  const type = MERCH_FIELD_TYPES.includes(raw.type as MerchFieldType)
    ? (raw.type as MerchFieldType)
    : "text";
  const options = Array.isArray(raw.options)
    ? raw.options.filter((o): o is string => typeof o === "string" && o.trim() !== "")
    : null;
  return {
    key,
    label_de: typeof raw.label_de === "string" ? raw.label_de : null,
    label_en: typeof raw.label_en === "string" ? raw.label_en : null,
    type,
    required: raw.required !== false,
    options: options && options.length > 0 ? options : null,
    max_length: typeof raw.max_length === "number" ? raw.max_length : null,
  };
}

/**
 * Schema eines Produkts lesen. Akzeptiert die Liste direkt und die Form
 * `{ fields: [...] }` — beides kommt vor, je nachdem wer das Produkt anlegt.
 * `null` heißt: kein Merch-Artikel, also kein Dialog.
 */
export function parseMerchSchema(value: unknown): MerchField[] | null {
  const list = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.fields)
      ? value.fields
      : null;
  if (!list) return null;
  const fields = list.map(toField).filter((f): f is MerchField => f !== null);
  return fields.length > 0 ? fields : null;
}

/** Die Größenverteilung eines Feldes als `{ Größe: Anzahl }`. */
export function sizesOf(values: MerchValues, key: string): Record<string, number> {
  const raw = values[key];
  if (!isRecord(raw)) return {};
  const out: Record<string, number> = {};
  for (const [size, n] of Object.entries(raw)) {
    const count = Number(n);
    if (Number.isFinite(count) && count > 0) out[size] = Math.trunc(count);
  }
  return out;
}

export function sizesTotal(values: MerchValues, key: string): number {
  return Object.values(sizesOf(values, key)).reduce((sum, n) => sum + n, 0);
}

/** `true`, wenn zu diesem Feld überhaupt etwas dasteht. */
function answered(field: MerchField, values: MerchValues): boolean {
  const raw = values[field.key];
  if (field.type === "sizes") return sizesTotal(values, field.key) > 0;
  // Ein Haken gilt als beantwortet, wenn er gesetzt ist — sonst wäre
  // „nicht gewünscht" nicht ausdrückbar und die Pflicht unerfüllbar.
  if (field.type === "boolean") return raw === true || raw === "true";
  if (raw === undefined || raw === null) return false;
  return String(raw).trim() !== "";
}

/**
 * Was an dieser Konfiguration noch nicht stimmt. Leere Liste = in Ordnung.
 *
 * `qty` ist die Bestellmenge der Zeile: eine Größenverteilung muss sie genau
 * treffen, sonst bestellt jemand zehn Shirts und verteilt acht.
 */
export function checkMerchValues(
  fields: readonly MerchField[],
  values: MerchValues,
  qty: number,
): MerchProblem[] {
  const problems: MerchProblem[] = [];
  for (const field of fields) {
    const filled = answered(field, values);
    if (field.required && !filled) {
      problems.push({ key: field.key, reason: "required" });
      continue;
    }
    if (!filled) continue;

    if (field.type === "sizes") {
      const total = sizesTotal(values, field.key);
      if (total !== qty) {
        problems.push({ key: field.key, reason: "sizes_sum", detail: `${total}/${qty}` });
      }
      continue;
    }
    if (field.type === "select" && field.options) {
      const value = String(values[field.key]);
      if (!field.options.includes(value)) {
        problems.push({ key: field.key, reason: "not_an_option", detail: value });
      }
      continue;
    }
    if ((field.type === "text" || field.type === "textarea") && field.max_length != null) {
      const value = String(values[field.key]).trim();
      if (value.length > field.max_length) {
        problems.push({
          key: field.key,
          reason: "too_long",
          detail: `${value.length}/${field.max_length}`,
        });
      }
    }
  }
  return problems;
}

/**
 * Antworten so formen, wie die Felder es vorgeben — Zahl als Zahl, Haken als
 * Wahrheitswert, Größen ohne Nullzeilen. Leere freiwillige Felder fallen weg,
 * damit an der Zeile kein `""` landet.
 */
export function merchPayload(
  fields: readonly MerchField[],
  values: MerchValues,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = values[field.key];
    if (field.type === "sizes") {
      const sizes = sizesOf(values, field.key);
      if (Object.keys(sizes).length > 0) out[field.key] = sizes;
      continue;
    }
    if (field.type === "boolean") {
      out[field.key] = raw === true || raw === "true";
      continue;
    }
    if (raw === undefined || raw === null) continue;
    const text = String(raw).trim();
    if (text === "") continue;
    out[field.key] = field.type === "number" ? Number(text) : text;
  }
  return out;
}

/** Kurzfassung einer Konfiguration für Warenkorb, Historie und Admin. */
export function describeMerch(
  fields: readonly MerchField[],
  config: Record<string, unknown> | null,
  locale: string,
): { label: string; value: string }[] {
  if (!config) return [];
  const values = config as MerchValues;
  const out: { label: string; value: string }[] = [];
  for (const field of fields) {
    const label =
      (locale === "en" ? field.label_en : field.label_de) ?? field.label_de ?? field.key;
    if (field.type === "sizes") {
      const sizes = sizesOf(values, field.key);
      const order = field.options ?? Object.keys(sizes);
      const text = order
        .filter((size) => sizes[size])
        .map((size) => `${size} ${sizes[size]}`)
        .join(" · ");
      if (text) out.push({ label, value: text });
      continue;
    }
    const raw = values[field.key];
    if (raw === undefined || raw === null || raw === "") continue;
    if (field.type === "boolean") {
      if (raw === true || raw === "true") out.push({ label, value: "✓" });
      continue;
    }
    out.push({ label, value: String(raw) });
  }
  return out;
}

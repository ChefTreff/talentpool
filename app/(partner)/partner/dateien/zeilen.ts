import type { Deliverable } from "@/app/(partner)/partner/types";
import type { FileRules } from "@/lib/partner/file-rules";

/**
 * Was die Zeilen der Dateien-Seite aus den Pflichten machen (PART-109, Konrad 08.10.2026, K-73): ihre Reihenfolge, wann
 * hochgeladen werden darf und wie der Name in der Zeile lautet. Ohne React, damit die Tests es ausführen.
 */

/**
 * Die Reihenfolge der Dateien („Offenes zuerst“).
 *
 * Was etwas von den Partnern braucht, steht oben — **überfällig, offen und zurückgewiesen** (dort darf der Partner
 * hochladen); dann **eingereicht**; dann **angenommen**. Innerhalb einer Gruppe nach Frist, die früheste zuerst, ohne
 * Frist zuletzt; bei gleicher Frist die Logos vor allem anderen (sie braucht jeder Partner, und nach ihnen fragt man
 * zuerst), dann die Reihenfolge der Pflicht (`sort`) und der Schlüssel.
 */
const GRUPPE: Record<Deliverable["status"], number> = {
  overdue: 0,
  open: 0,
  rejected: 0,
  submitted: 1,
  accepted: 2,
};

type Datei = Pick<Deliverable, "status" | "due_at" | "key" | "sort">;

const frist = (d: Datei) => (d.due_at ? new Date(d.due_at).getTime() : Number.POSITIVE_INFINITY);
const logoZuerst = (d: Datei) => (d.key.startsWith("logo_") ? 0 : 1);

export function dateiReihenfolge<T extends Datei>(pflichten: T[]): T[] {
  return [...pflichten].sort((a, b) => {
    const gruppe = GRUPPE[a.status] - GRUPPE[b.status];
    if (gruppe !== 0) return gruppe;
    // `Infinity - Infinity` ist `NaN`: zwei Dateien ohne Frist sind gleich früh.
    const fa = frist(a);
    const fb = frist(b);
    if (fa !== fb) return fa < fb ? -1 : 1;
    return logoZuerst(a) - logoZuerst(b) || a.sort - b.sort || a.key.localeCompare(b.key);
  });
}

/** Kann der Partner hier noch hochladen? Dieselben Stände wie `submit_deliverable`. */
export const HOCHLADBAR: ReadonlySet<Deliverable["status"]> = new Set(["open", "rejected", "overdue"]);

/**
 * Das eine Format, das die Dateiregeln erlauben — sonst `null`. Erlauben die Regeln mehrere (Digital-Branding: PDF, PNG,
 * SVG, JPG, ZIP), steht keines in der Zeile: das erste zu nennen hieße, den Rest zu verschweigen. `jpg` und `jpeg`
 * zählen als ein Format.
 */
export function einzigesFormat(rules: FileRules): string | null {
  const ext = new Set((rules?.ext ?? []).map((e) => e.toLowerCase().replace(/^jpeg$/, "jpg")));
  return ext.size === 1 ? [...ext][0].toUpperCase() : null;
}

/**
 * Der Name in der Zeile: der Name der Pflicht, das Format in Klammern dahinter („Rückwand-Druckdatei (PDF)“) — außer der
 * Name nennt es schon („Logo als PNG“) oder die Regeln erlauben mehrere Formate (`einzigesFormat`).
 */
export function dateiName(label: string, rules: FileRules): string {
  const format = einzigesFormat(rules);
  if (format === null) return label;
  return new RegExp(`\\b${format}\\b`, "i").test(label) ? label : `${label} (${format})`;
}

/** Das Format einer hochgeladenen Datei, aus ihrem Namen: „PNG“; ohne Endung leer. */
export function dateiFormat(a: { filename: string | null; storage_path: string }): string {
  return /\.([A-Za-z0-9]{1,8})$/.exec(a.filename ?? a.storage_path)?.[1]?.toUpperCase() ?? "";
}

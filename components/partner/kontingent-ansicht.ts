/**
 * Kontingente als Gruppen (PART-111): alle Kontingente einer Organisation und Edition mit derselben
 * Rabattstufe teilen sich einen Coupon, also einen Code und einen Shop-Link. Die Admin-Tabelle zeigt sie
 * beisammen, Code und Link stehen nur an der ersten Zeile der Gruppe, und das Speichern von Code oder
 * Link gilt für die ganze Gruppe.
 */
export type KontingentZeile = {
  id: string;
  org_id: string;
  org_name: string | null;
  edition_id: string;
  discount_percent: number;
  pass_type: string;
  status: string;
  coupon_code?: string | null;
};

/** Dieselbe Gruppe wie im Lauf (`gruppenSchluessel` in `lib/vivenu/kontingent-gruppe.ts`). */
const schluessel = (z: Pick<KontingentZeile, "org_id" | "edition_id" | "discount_percent">) =>
  `${z.org_id}|${z.edition_id}|${z.discount_percent}`;

/** Fehler zuerst, dann ausstehend, dann aktiv, zuletzt abgeschaltet — wie die Funktion `ticket_allocations_admin`. */
const STAND_RANG: Record<string, number> = { error: 0, pending_vivenu: 1, active: 2, disabled: 3 };

/**
 * Die Zeilen nach Gruppen: eine Gruppe steht zusammen, der schlechteste Stand ihrer Zeilen bestimmt ihren
 * Platz (eine Gruppe mit einem Fehler steht oben, auch wenn die anderen Zeilen aktiv sind), innerhalb
 * der Stand nach Organisation und Rabattstufe. `kopf` ist die erste Zeile der Gruppe — an ihr stehen Code
 * und Link, und die übrigen sagen „wie oben“.
 *
 * **Der Kopf ist die erste Zeile, die den Code trägt**, erst danach nach Kategorie: stünde eine fehlerhafte
 * Zeile ohne Code zuerst (in Konrads Testorganisation ist es investor, ohne Tickettyp), zeigte der Kopf
 * leere Felder, und „wie oben“ verwiese auf nichts. Hat keine Zeile einen Code, ist es die erste nach Kategorie.
 */
export function nachGruppen<T extends KontingentZeile>(rows: T[]): { zeile: T; kopf: boolean }[] {
  const gruppen = new Map<string, T[]>();
  for (const r of rows) gruppen.set(schluessel(r), [...(gruppen.get(schluessel(r)) ?? []), r]);
  const rang = (zeilen: T[]) => Math.min(...zeilen.map((z) => STAND_RANG[z.status] ?? 9));
  const tragtCode = (z: T) => (z.status === "active" && z.coupon_code ? 0 : 1);
  return [...gruppen.values()]
    .map((zeilen) => ({
      zeilen: [...zeilen].sort((a, b) => tragtCode(a) - tragtCode(b) || a.pass_type.localeCompare(b.pass_type)),
      rang: rang(zeilen),
    }))
    .sort(
      (a, b) =>
        a.rang - b.rang ||
        (a.zeilen[0].org_name ?? "").localeCompare(b.zeilen[0].org_name ?? "") ||
        b.zeilen[0].discount_percent - a.zeilen[0].discount_percent,
    )
    .flatMap((g) => g.zeilen.map((zeile, i) => ({ zeile, kopf: i === 0 })));
}

/**
 * Die anderen Zeilen derselben Gruppe, ohne abgeschaltete: ihnen gehört derselbe Code. Der Server bestimmt
 * sie selbst aus der Liste der Datenbank und vertraut keiner Liste aus dem Browser.
 */
export function geschwister<T extends KontingentZeile>(rows: T[], id: string): T[] {
  const selbst = rows.find((r) => r.id === id);
  if (!selbst) return [];
  return rows.filter((r) => r.id !== id && r.status !== "disabled" && schluessel(r) === schluessel(selbst));
}

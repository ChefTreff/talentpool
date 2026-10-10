/**
 * Die Umsatzsteuersätze einer Bestellung als Text (PART-117, Konrad 05.10.: in der Übersicht je Bestellung bei der USt. „(19 %)“ dazuschreiben).
 *
 * Der Satz steht je Zeile (`shop_order_line.vat_rate`, in Prozent); `vat_cents` der Bestellung ist die Summe über alle Zeilen. Haben alle Zeilen denselben Satz,
 * steht er da („19 %“); mischen sie (Messestand 19 %, Essen 7 %), stehen alle, aufsteigend und je einmal („7 % · 19 %“) — eine Zahl, die nur einen der beiden nennt,
 * stimmte nicht. Ohne Zeilen oder ohne Satz: `null`, dann bleibt die Beschriftung, wie sie war. Das Leerzeichen vor dem Prozentzeichen ist geschützt, damit „19“ und „%“
 * nicht auf zwei Zeilen auseinanderfallen.
 */
export function ustSaetze(
  zeilen: readonly { vat_rate: number | string | null }[] | null | undefined,
  dateLocale: string,
): string | null {
  const saetze = [
    ...new Set(
      (zeilen ?? [])
        .map((z) => (z.vat_rate === null || z.vat_rate === undefined || z.vat_rate === "" ? NaN : Number(z.vat_rate)))
        .filter((r) => Number.isFinite(r) && r >= 0),
    ),
  ].sort((a, b) => a - b);
  if (saetze.length === 0) return null;
  const zahl = new Intl.NumberFormat(dateLocale, { maximumFractionDigits: 2 });
  return saetze.map((r) => `${zahl.format(r)}\u00a0%`).join(" · ");
}

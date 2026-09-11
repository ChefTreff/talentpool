/** Netto in Euro — im Shop sind alle Preise netto (Arbeitsauftrag C). */
export function money(cents: number | null | undefined, dateLocale: string): string {
  return ((cents ?? 0) / 100).toLocaleString(dateLocale, {
    style: "currency",
    currency: "EUR",
  });
}

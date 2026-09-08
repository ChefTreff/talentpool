/** Klassen zusammenfügen; falsy Werte fallen raus. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

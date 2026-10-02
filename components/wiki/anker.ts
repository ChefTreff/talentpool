/**
 * Die Adresse eines Wiki-Artikels: `#slug` (so verlinken die Quellen des
 * Assistenten) oder `#slug/abschnitt` für einen Abschnitt darin.
 *
 * Der Abschnitt hängt hinter dem Schrägstrich statt als eigener Anker, weil der
 * Anker des Artikels sonst verloren ginge: Wer `#frist` aufriefe, öffnete
 * keinen Artikel, und ein Neuladen zeigte die Liste statt der Seite.
 */
export function leseAnker(hash: string): { slug: string; abschnitt: string | null } | null {
  const roh = hash.replace(/^#/, "");
  if (!roh) return null;
  // Ein von Hand verstümmelter Anker (`#%zz`) lässt `decodeURIComponent` werfen —
  // das wäre ein Fehler der ganzen Seite wegen einer kaputten Adresszeile.
  let anker: string;
  try {
    anker = decodeURIComponent(roh);
  } catch {
    anker = roh;
  }
  const i = anker.indexOf("/");
  const slug = i === -1 ? anker : anker.slice(0, i);
  const abschnitt = i === -1 ? null : anker.slice(i + 1) || null;
  return slug ? { slug, abschnitt } : null;
}

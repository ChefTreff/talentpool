/**
 * Welche Klicks `useUngesichert` abfängt (QS-051) — als reine Funktion, damit
 * `tests/ungesichert.test.ts` die Fälle festhält.
 *
 * Abgefangen wird nur, was die Seite im selben Fenster verlässt und dabei die
 * Eingabe verlöre: ein Link im Portal zu einer anderen Seite. Durch gehen
 * Strg-/Cmd-/Umschalt-Klicks und die mittlere Taste (neues Fenster oder Tab),
 * Links mit eigenem Zielfenster, Downloads, Sprünge auf derselben Seite (`#abschnitt`) und
 * fremde Seiten — die deckt `beforeunload` mit dem Browser-Dialog ab.
 */

export type LinkAngaben = { href: string; target: string; download: boolean };
export type Ort = { href: string; origin: string; pathname: string; search: string };
export type Taste = { button: number; meta: boolean; ctrl: boolean; shift: boolean; alt: boolean };

/** Ziel (Pfad, Suche, Anker) eines abzufangenden Klicks, sonst `null`. */
export function zielBeiKlick(link: LinkAngaben, ort: Ort, taste: Taste): string | null {
  if (taste.button !== 0 || taste.meta || taste.ctrl || taste.shift || taste.alt) return null;
  if ((link.target && link.target !== "_self") || link.download) return null;
  const url = new URL(link.href, ort.href);
  if (url.origin !== ort.origin) return null;
  if (url.pathname === ort.pathname && url.search === ort.search) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Scrollt der Router nach „Seite verlassen“ an den Anfang? Ein Wechsel **auf derselben Seite** — gleicher Pfad, andere Abfrage (ein Umschalter wie
 * `InstanzWahl`, ein Reiter über die Adresszeile) — ist der Zustand der Seite, kein Seitenwechsel: sie bleibt, wo sie ist. Ohne diese Regel sprang sie
 * nach der Rückfrage nach oben, obwohl der Reiter `scroll={false}` trug (Design 10.10.2026, #468: 3186 → 0 gemessen; der Klick selbst ließ sie stehen,
 * aber `router.push(ziel)` kennt den Link nicht mehr). Ein Anker im Ziel (`#abschnitt`) und jede andere Seite behalten den Standard von Next.
 */
export function scrolltNachRueckfrage(ziel: string, ort: Pick<Ort, "origin" | "pathname">): boolean {
  const url = new URL(ziel, ort.origin);
  return !(url.pathname === ort.pathname && url.hash === "");
}

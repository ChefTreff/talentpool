/**
 * Loom-Freigabelink → Einbettungsadresse.
 *
 * `loom.com/share/<id>` wird zu `loom.com/embed/<id>`. Der Freigabelink
 * selbst lässt sich nicht einbetten; in der Redaktion kopiert aber jeder den
 * Freigabelink, also rechnen wir hier um, statt es zu verlangen.
 *
 * **Ohne `www.` bliebe der Rahmen leer.** Der CHECK in der Datenbank erlaubt
 * beide Schreibweisen, die CSP kennt aber nur `https://www.loom.com`. Die
 * CSP eng zu lassen und hier zu normalisieren ist die richtige Richtung: eine
 * zweite erlaubte Herkunft im `frame-src` wäre eine Tür für einen Tippfehler
 * (Review 15.09.).
 */
export function loomEmbedUrl(url: string): string {
  return url
    .replace(/^https:\/\/loom\.com\//, "https://www.loom.com/")
    .replace("/share/", "/embed/")
    .split("?")[0];
}

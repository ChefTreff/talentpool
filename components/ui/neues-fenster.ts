/**
 * Links, die das Portal verlassen, öffnen ein neues Fenster (QS-034).
 *
 * Konrad, 23.09.: „generell sollen global immer alle Tabs die nach extern
 * leiten im neuen Tab geöffnet werden." Wer auf „In Google Kalender
 * eintragen" klickt, soll seine Seite nicht verlieren.
 *
 * Drei Dinge gehören zusammen, sonst ist es halb gemacht:
 * - `target="_blank"` — das neue Fenster;
 * - `rel="noopener noreferrer"` — ohne `noopener` bekäme die geöffnete Seite
 *   `window.opener` und könnte unsere Seite umleiten; `noreferrer` verrät ihr
 *   nicht, von welcher Portalseite man kam;
 * - der **Hinweis für Vorlesesoftware** — ein neues Fenster ohne Ansage
 *   desorientiert. Der Text steht **einmal** im Root-Layout
 *   (`NEUES_FENSTER_ID`, Wörterbuch `common.newTab`), und jeder externe Link
 *   verweist mit `aria-describedby` darauf. So muss niemand den Satz durch
 *   Komponenten reichen, und kein Link kann ihn vergessen.
 *
 * Verwendung: `<a href={url} {...neuesFenster}>` oder
 * `<ButtonLink href={url} {...neuesFenster}>`.
 *
 * **Nicht** für Links, die eine Datei herunterladen (die eigene `.ics`,
 * signierte Adressen mit `download: true`): dort bliebe ein leeres Fenster
 * zurück. Solche Links tragen `download`.
 *
 * `tests/externe-links.test.ts` lässt neue Links ohne diese Angaben auffallen.
 */
export const NEUES_FENSTER_ID = "ct-neues-fenster";

export const neuesFenster = {
  target: "_blank",
  rel: "noopener noreferrer",
  "aria-describedby": NEUES_FENSTER_ID,
} as const;

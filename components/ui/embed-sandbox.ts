/**
 * Sandbox, die `EmbedGate` setzt, wenn der Aufrufer keine eigene mitgibt — die Vorgabe für Loom-Videos.
 *
 * **`allow-same-origin` steht seit K-76 dabei** (Konrad, 08.10.2026, PART-115): ohne es startet der Loom-Player nicht,
 * der Rahmen bleibt leer (im Browser geprüft: `allow-scripts allow-presentation` bleibt leer, mit `allow-same-origin`
 * spielt das Video). Das Flag meint die Herkunft des **Rahmens** (`www.loom.com`), nicht unsere: der Rahmen kommt von
 * einer anderen Herkunft und erreicht weder unsere Cookies noch unsere Seite.
 *
 * `allow-scripts` zusammen mit `allow-same-origin` wäre bei einem Rahmen **gleicher** Herkunft ein Fehler: er könnte
 * seine Sandbox selbst entfernen. Das schließen drei Dinge aus, die der Test `tests/rundgang.test.ts` festhält:
 * die Adresse eines Videos beginnt laut Datenbank immer mit `https://www.loom.com/` oder `https://loom.com/`
 * (`portal_video.url`), der Rundgang bettet nur `my.matterport.com` ein (`rundgangAus`), und die Seiten des Portals
 * lassen sich gar nicht rahmen (`frame-ancestors 'none'` in `proxy.ts`). Wer eines davon lockert, prüft diese Vorgabe mit.
 *
 * Nicht dabei und nicht ohne Grund zu ergänzen: `allow-top-navigation*` (der Rahmen könnte die Seite wegnavigieren),
 * `allow-popups`, `allow-forms`, `allow-modals`, `allow-pointer-lock`. Wer mehr braucht — der Matterport-Rundgang —,
 * setzt es dort, wo er einbettet (`rundgang-adresse.ts`).
 */
export const EMBED_SANDBOX = "allow-scripts allow-presentation allow-same-origin";

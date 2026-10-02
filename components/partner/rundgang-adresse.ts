/**
 * Der 3D-Rundgang des Summits (PART-093) — Link-Eintrag → Einbettung.
 *
 * Die Adresse steht nicht im Code, sondern als Eintrag `partner_3d_tour`
 * (Zielgruppe Partner) unter Admin → Medien → Links; wer den Rundgang für
 * eine neue Edition tauscht, tauscht ihn dort. Die Datenbank erlaubt für
 * einen Link **jede** https-Adresse (`portal_link.url`), die CSP aber nur
 * `https://my.matterport.com` als Rahmen (`proxy.ts`, `frame-src`). Damit
 * beides zusammenpasst, bettet die Seite nur ein, was genau diese Form hat;
 * jede andere https-Adresse bleibt ein Link. Wie bei Loom (`loom.ts`) gilt:
 * die CSP eng lassen und hier prüfen, statt dort eine zweite Herkunft zu
 * erlauben.
 *
 * Aus der Adresse bleibt nur die Modellkennung im Rahmen; weitere Parameter
 * (`play`, `qs` …) fallen weg, die Kennung hat einen festen Zeichensatz.
 */
export const RUNDGANG_SCHLUESSEL = "partner_3d_tour";

/** Die einzige Herkunft, die die CSP für Rahmen erlaubt. */
export const MATTERPORT_HOST = "my.matterport.com";

/**
 * Sandbox des Matterport-Rahmens. Anders als bei Loom (`EmbedGate`-Vorgabe,
 * ohne `allow-same-origin`) startet der Player so **nicht** — der Rahmen
 * bleibt schwarz (geprüft 02.10.2026). `allow-same-origin` bezieht sich hier
 * auf die Herkunft des Rahmens (my.matterport.com), nicht auf unsere; ohne
 * `allow-top-navigation` kann er die Seite nicht wegnavigieren.
 */
export const MATTERPORT_SANDBOX =
  "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation allow-pointer-lock allow-forms";

/** Kamera und Vollbild für den 3D-Rundgang; `xr-spatial-tracking` für VR-Brillen. */
export const MATTERPORT_ALLOW = "fullscreen; xr-spatial-tracking";

const KENNUNG = /^[A-Za-z0-9]{6,32}$/;

export type Rundgang = {
  /** Adresse für den Rahmen — nur `https://my.matterport.com/show/?m=<Kennung>`, sonst `null` (dann bleibt der Link). */
  einbettung: string | null;
  /** Adresse zum Öffnen in einem eigenen Fenster: https, so wie das Team sie eingetragen hat. */
  oeffnen: string;
};

/**
 * Aus dem Link-Eintrag den Rundgang. `null`, wenn keine brauchbare https-Adresse
 * vorliegt — die Seite lässt den Abschnitt dann weg, statt einen leeren Rahmen
 * zu zeigen.
 */
export function rundgangAus(url: string | null | undefined): Rundgang | null {
  const roh = (url ?? "").trim();
  if (!/^https:\/\/[^\s]+$/.test(roh)) return null;
  let u: URL;
  try {
    u = new URL(roh);
  } catch {
    return null;
  }
  const kennung = u.searchParams.get("m");
  const matterport =
    u.protocol === "https:" &&
    u.hostname === MATTERPORT_HOST &&
    u.port === "" &&
    u.username === "" &&
    u.password === "" &&
    /^\/show\/?$/.test(u.pathname) &&
    kennung !== null &&
    KENNUNG.test(kennung);
  return {
    einbettung: matterport ? `https://${MATTERPORT_HOST}/show/?m=${kennung}` : null,
    oeffnen: roh,
  };
}

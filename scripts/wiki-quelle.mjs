/**
 * Quelldateien der Wissensbasis lesen (`content/wiki/*.md`).
 *
 * Eine Datei je Artikel: ein Kopf zwischen `---`-Zeilen, darunter der Text als
 * Markdown. Der Kopf ist bewusst **kein YAML** — wir brauchen fünf Felder und
 * keine Abhängigkeit, und ein eigener Leser kann sagen, was fehlt.
 *
 * Felder:
 * - `slug`        Pflicht, bestimmt den Artikel in `kb_article`.
 * - `titel`       Pflicht.
 * - `zielgruppe`  Pflicht, Komma-Liste aus ZIELGRUPPEN. Das ist Konrads
 *                 „Kategorie": sie steuert, wer den Artikel sieht und was im
 *                 Chatbot landet (ADM-008). Ohne sie wird nicht importiert.
 * - `phase`       aus PHASEN, Vorgabe `evergreen`.
 * - `status`      `draft` oder `published`, Vorgabe `draft`.
 * - `quelle`      Herkunfts-URL (Notion). Steht nur im Kopf, nie im Text.
 * - `pruefen`     Semikolon-Liste offener Punkte. Daraus entsteht **sichtbar**
 *                 der erste Absatz des Artikels — ein veröffentlichter Artikel
 *                 soll nicht so tun, als stünde eine Angabe schon fest.
 *
 * Dieses Modul lädt nichts und schreibt nichts, damit `npm test` es lesen kann.
 */
import fs from "node:fs";
import path from "node:path";

/** Spiegel von KB_AUDIENCES in components/wiki/types.ts — tests/wiki-inhalte prüft das. */
export const ZIELGRUPPEN = ["partner", "speaker", "talent", "volunteer", "hackathon"];
/** Spiegel von KB_PHASES. */
export const PHASEN = ["evergreen", "vor", "aufbau", "event", "abbau"];
export const STATUS = ["draft", "published"];

/** Vorspann je Artikel, wenn `pruefen` gesetzt ist. */
export function hinweisAbsatz(pruefen) {
  if (pruefen.length === 0) return null;
  return (
    "> **Für 2027 noch nicht final:** " +
    pruefen.join("; ") +
    ". Wir ergänzen die Angaben hier, sobald sie feststehen — verbindliche Fristen " +
    "stehen immer zusätzlich in eurer Aufgabenliste im Portal."
  );
}

function kopfWert(zeile) {
  const treffer = /^([a-z_]+):\s*(.*)$/.exec(zeile);
  if (!treffer) return null;
  let wert = treffer[2].trim();
  // Ein in Anführungszeichen gesetzter Wert (Titel mit Doppelpunkt) wird entpackt.
  if (wert.length > 1 && wert.startsWith('"') && wert.endsWith('"')) wert = wert.slice(1, -1);
  return [treffer[1], wert];
}

/**
 * Eine Quelldatei lesen. Wirft mit Dateinamen, wenn ein Pflichtfeld fehlt oder
 * ein Schlüssel nicht im Vokabular steht — lieber hier laut als später ein
 * Artikel ohne Kategorie in der Datenbank.
 */
export function parseQuelle(roh, datei) {
  const text = roh.replace(/\r\n/g, "\n");
  const treffer = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!treffer) throw new Error(`${datei}: Kopf zwischen --- fehlt`);

  const kopf = {};
  for (const zeile of treffer[1].split("\n")) {
    if (!zeile.trim()) continue;
    const paar = kopfWert(zeile);
    if (!paar) throw new Error(`${datei}: Kopfzeile nicht lesbar: ${zeile}`);
    kopf[paar[0]] = paar[1];
  }

  const slug = kopf.slug ?? "";
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`${datei}: slug fehlt oder ungültig`);
  if (!kopf.titel) throw new Error(`${datei}: titel fehlt`);

  const zielgruppe = (kopf.zielgruppe ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (zielgruppe.length === 0) throw new Error(`${datei}: zielgruppe ist Pflicht (ADM-008)`);
  for (const z of zielgruppe) {
    if (!ZIELGRUPPEN.includes(z)) throw new Error(`${datei}: unbekannte zielgruppe ${z}`);
  }

  const phase = kopf.phase ?? "evergreen";
  if (!PHASEN.includes(phase)) throw new Error(`${datei}: unbekannte phase ${phase}`);
  const status = kopf.status ?? "draft";
  if (!STATUS.includes(status)) throw new Error(`${datei}: unbekannter status ${status}`);

  const pruefen = (kopf.pruefen ?? "").split(";").map((x) => x.trim()).filter(Boolean);
  const rumpf = text.slice(treffer[0].length).trim();
  if (!rumpf) throw new Error(`${datei}: kein Text`);

  const hinweis = hinweisAbsatz(pruefen);
  return {
    datei,
    slug,
    titel: kopf.titel,
    zielgruppe,
    phase,
    status,
    quelle: kopf.quelle ?? null,
    pruefen,
    /** Nur der Text aus der Datei — ohne den erzeugten Hinweis. */
    rumpf,
    /** Was in `kb_article.body_md` landet. */
    koerper: hinweis ? `${hinweis}\n\n${rumpf}` : rumpf,
  };
}

/** Alle Quelldateien eines Ordners, nach Slug sortiert. */
export function leseQuellen(ordner) {
  const dateien = fs.readdirSync(ordner).filter((f) => f.endsWith(".md")).sort();
  const artikel = dateien.map((f) => parseQuelle(fs.readFileSync(path.join(ordner, f), "utf8"), f));
  const gesehen = new Map();
  for (const a of artikel) {
    if (gesehen.has(a.slug)) throw new Error(`Slug doppelt: ${a.slug} (${gesehen.get(a.slug)}, ${a.datei})`);
    gesehen.set(a.slug, a.datei);
  }
  return artikel;
}

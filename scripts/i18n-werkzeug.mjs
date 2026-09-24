/**
 * Gemeinsame Werkzeuge für die Wörterbücher `lib/i18n/de.json` und `en.json`
 * (QS-047, entschieden 24.09.2026: alphabetisch mit Test, plus Zusammenführen).
 *
 * Warum: Die Schlüssel standen in Einfügereihenfolge. Wer ergänzte, hängte ans
 * Ende eines Objekts an und änderte dabei die bisher letzte Zeile (sie bekommt
 * ein Komma) — zwei PRs im selben Namensraum trafen so dieselbe Zeile, auch in
 * `rpc` und `common`, die allen gehören. Alphabetisch sortiert landet ein neuer
 * Schlüssel mitten im Objekt; die Nachbarzeilen bleiben unberührt.
 *
 * Benutzt von `scripts/i18n-sortieren.mjs`, `scripts/i18n-zusammenfuehren.mjs`
 * und `tests/woerterbuch.test.ts` — eine Stelle, damit Skript und Test nie
 * verschieden sortieren.
 */

export const WOERTERBUECHER = ["lib/i18n/de.json", "lib/i18n/en.json"];

/**
 * Reiner Codepunkt-Vergleich, **kein** `localeCompare` (Auflage der
 * Architektur-Session): dieselbe Reihenfolge auf jedem Rechner und in jeder
 * Node-Version, unabhängig von Sprachtabellen.
 */
export function vergleich(a, b) {
  const x = Array.from(a);
  const y = Array.from(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    const d = x[i].codePointAt(0) - y[i].codePointAt(0);
    if (d !== 0) return d;
  }
  return x.length - y.length;
}

/**
 * Objekte rekursiv nach Schlüssel sortiert. **Arrays behalten ihre
 * Reihenfolge** — `partnerEventApp.steps` ist eine Schrittfolge, keine Menge.
 */
export function sortiert(wert) {
  if (Array.isArray(wert)) return wert.map(sortiert);
  if (wert && typeof wert === "object") {
    return Object.fromEntries(
      Object.keys(wert)
        .sort(vergleich)
        .map((k) => [k, sortiert(wert[k])]),
    );
  }
  return wert;
}

/** Die Schreibweise der Dateien: zwei Leerzeichen, ein Zeilenende am Schluss. */
export function formatiert(wert) {
  return JSON.stringify(wert, null, 2) + "\n";
}

function gleich(a, b) {
  return JSON.stringify(sortiert(a)) === JSON.stringify(sortiert(b));
}

function istObjekt(w) {
  return w !== null && typeof w === "object" && !Array.isArray(w);
}

/**
 * Drei-Wege-Zusammenführung zweier Fassungen gegen ihre gemeinsame Basis.
 *
 * - Beide gleich, oder nur eine Seite hat geändert → die geänderte gilt.
 * - Beide sind Objekte → Schlüssel für Schlüssel, über die Vereinigung.
 *   Neue Schlüssel beider Seiten kommen zusammen; ein auf einer Seite
 *   gelöschter und auf der anderen unveränderter Schlüssel bleibt gelöscht.
 * - Derselbe Schlüssel auf beiden Seiten verschieden geändert → **Konflikt**:
 *   der Wert der ersten Fassung (`unsere`) steht im Ergebnis, der Pfad in
 *   `konflikte` — entscheiden muss ein Mensch.
 *
 * `undefined` heisst „nicht vorhanden".
 */
export function zusammenfuehren(basis, unsere, ihre, pfad = []) {
  const konflikte = [];
  const wert = mischen(basis, unsere, ihre, pfad, konflikte);
  return { wert, konflikte };
}

function mischen(basis, unsere, ihre, pfad, konflikte) {
  if (gleich(unsere, ihre)) return unsere;
  if (gleich(basis, unsere)) return ihre;
  if (gleich(basis, ihre)) return unsere;
  if (istObjekt(unsere) && istObjekt(ihre)) {
    const b = istObjekt(basis) ? basis : {};
    const ergebnis = {};
    const schluessel = new Set([...Object.keys(b), ...Object.keys(unsere), ...Object.keys(ihre)]);
    for (const k of [...schluessel].sort(vergleich)) {
      const w = mischen(b[k], unsere[k], ihre[k], [...pfad, k], konflikte);
      if (w !== undefined) ergebnis[k] = w;
    }
    return ergebnis;
  }
  konflikte.push(pfad.join("."));
  return unsere;
}

/** Alle Pfade zu Blättern, z. B. `speaker.title` — für den Abgleich DE/EN. */
export function blattPfade(wert, pfad = []) {
  if (istObjekt(wert)) return Object.keys(wert).flatMap((k) => blattPfade(wert[k], [...pfad, k]));
  if (Array.isArray(wert)) return wert.flatMap((w, i) => blattPfade(w, [...pfad, String(i)]));
  return [pfad.join(".")];
}

/**
 * Doppelte Schlüssel im **Rohtext** — `JSON.parse` nimmt bei Dubletten stumm
 * den letzten Wert, im geparsten Objekt ist also nichts mehr zu sehen.
 * Ein kleiner Leser über Zeichenketten, Objekte und Arrays genügt: er merkt
 * sich je Objekt die Schlüssel und meldet Pfad und Zeile einer Wiederholung.
 */
export function dubletten(text) {
  const funde = [];
  const stapel = []; // je Ebene: { art: "objekt" | "array", schluessel: Set, pfad, index }
  let i = 0;
  let zeile = 1;
  let erwarteSchluessel = false;
  let letzterSchluessel = null;

  const lies = () => {
    // Zeichenkette ab text[i] === '"'; gibt den Inhalt zurück und setzt i dahinter.
    let s = "";
    i++;
    while (i < text.length && text[i] !== '"') {
      if (text[i] === "\\") {
        s += text.slice(i, i + 2);
        i += 2;
        continue;
      }
      if (text[i] === "\n") zeile++;
      s += text[i++];
    }
    i++;
    return JSON.parse(`"${s}"`);
  };

  while (i < text.length) {
    const c = text[i];
    if (c === "\n") {
      zeile++;
      i++;
    } else if (c === "{") {
      const oben = stapel.at(-1);
      const pfad = oben ? [...oben.pfad, oben.art === "objekt" ? letzterSchluessel : String(oben.index)] : [];
      stapel.push({ art: "objekt", schluessel: new Set(), pfad, index: 0 });
      erwarteSchluessel = true;
      i++;
    } else if (c === "[") {
      const oben = stapel.at(-1);
      const pfad = oben ? [...oben.pfad, oben.art === "objekt" ? letzterSchluessel : String(oben.index)] : [];
      stapel.push({ art: "array", schluessel: new Set(), pfad, index: 0 });
      erwarteSchluessel = false;
      i++;
    } else if (c === "}" || c === "]") {
      stapel.pop();
      erwarteSchluessel = false;
      i++;
    } else if (c === ",") {
      const oben = stapel.at(-1);
      if (oben?.art === "array") oben.index++;
      erwarteSchluessel = oben?.art === "objekt";
      i++;
    } else if (c === '"') {
      const inhalt = lies();
      const oben = stapel.at(-1);
      if (erwarteSchluessel && oben?.art === "objekt") {
        if (oben.schluessel.has(inhalt)) funde.push({ pfad: [...oben.pfad, inhalt].join("."), zeile });
        oben.schluessel.add(inhalt);
        letzterSchluessel = inhalt;
        erwarteSchluessel = false;
      }
    } else {
      i++;
    }
  }
  return funde;
}

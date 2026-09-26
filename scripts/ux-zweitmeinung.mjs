// UX-Zweitmeinung (QS-014, Design-Session 26.09.2026).
//
//   node scripts/ux-zweitmeinung.mjs
//
// Prüft `app/` und `components/` gegen die **Web Interface Guidelines** von
// Vercel (github.com/vercel-labs/web-interface-guidelines, Quelle des Skills
// „web-design-guidelines“) — als Zweitmeinung neben `scripts/ux-pruefung.mjs`,
// das die Regeln von `/portal-design` prüft. Widersprechen sich beide, gilt
// `/portal-design` (Konrad 25.09.). Einordnung je Regel und die Entscheidungen
// stehen in `docs/ux-zweitmeinung-2026-09-26.md`.
//
// Eine **Liste zum Hinsehen, kein Test**. Die Prüfungen lesen JSX-Tags ganz,
// auch über mehrere Zeilen (ein `>` in `() => …` beendet kein Tag).

import fs from "node:fs";
import path from "node:path";

const files = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (p.endsWith(".tsx")) files.push(p);
  }
};
walk("app");
walk("components");

/** Alle öffnenden JSX-Tags einer Datei: Name, Attribut-Text, Zeile. */
function tags(src) {
  const out = [];
  const re = /<([A-Za-z][\w.]*)(?=[\s/>])/g;
  let m;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length;
    let tiefe = 0;
    let quote = null;
    for (; i < src.length; i++) {
      const c = src[i];
      if (quote) {
        if (c === quote && src[i - 1] !== "\\") quote = null;
      } else if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") tiefe++;
      else if (c === "}") tiefe--;
      else if (c === ">" && tiefe === 0) break;
    }
    out.push({ name: m[1], attr: src.slice(m.index + m[0].length, i), zeile: src.slice(0, m.index).split("\n").length });
  }
  return out;
}

const funde = {};
const add = (regel, f, zeile, text) => (funde[regel] ??= []).push(`${f}:${zeile}  ${text.replace(/\s+/g, " ").trim().slice(0, 100)}`);

/**
 * Kommentare durch Leerzeichen ersetzen, Zeilenumbrüche bleiben — sonst
 * zählte ein `<img>` in einem Satz über `<img>` als Bild (Logo.tsx).
 * `//` nach einem Doppelpunkt ist eine Adresse, kein Kommentar.
 */
const ohneKommentare = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`])\/\/[^\n]*/g, (m, vor) => vor + " ".repeat(m.length - vor.length));

for (const f of files) {
  const src = ohneKommentare(fs.readFileSync(f, "utf8"));
  const zeilen = src.split("\n");
  for (const t of tags(src)) {
    const a = t.attr;
    // Accessibility: Klick auf Elementen ohne Rolle
    if (/^(div|span|li|td|tr|p|section)$/.test(t.name) && /\bonClick=/.test(a) && !/\brole=/.test(a)) {
      add("Klick auf div/span ohne Rolle und Tastatur", f, t.zeile, `<${t.name}${a}`);
    }
    // role="button" braucht Enter **und** Leertaste
    if (/role="button"/.test(a)) {
      const handler = a.match(/onKeyDown=\{([\s\S]*?)\}\s*(?:\w+=|$)/)?.[1] ?? "";
      if (!/onKeyDown=/.test(a)) add("role=button ohne Tastatur", f, t.zeile, `<${t.name}${a}`);
      else if (!/" "|'Space'|"Space"|Spacebar/.test(handler)) add("role=button reagiert nicht auf die Leertaste", f, t.zeile, handler);
    }
    // Images
    if (t.name === "img") {
      if (!/\balt=/.test(a)) add("img ohne alt", f, t.zeile, `<img${a}`);
      if (!(/\bwidth=/.test(a) && /\bheight=/.test(a))) add("img ohne width/height (Layout springt)", f, t.zeile, `<img${a}`);
    }
    // Forms: E-Mail-Felder. Nur rohe `<input>` — das Kit-`Input` setzt für
    // `type="email"` selbst spellCheck, autoCapitalize und autoComplete.
    if (t.name === "input" && /type="email"/.test(a)) {
      if (!/autoComplete=/.test(a)) add("E-Mail-Feld ohne autoComplete", f, t.zeile, `<${t.name}${a}`);
      if (!/spellCheck=\{false\}/.test(a)) add("E-Mail-Feld mit Rechtschreibprüfung", f, t.zeile, `<${t.name}${a}`);
    }
    // Navigation per onClick statt Link
    if (/onClick=\{[\s\S]*?(router\.push|location\.href\s*=)/.test(a)) add("Navigation per onClick statt Link", f, t.zeile, a);
  }
  // Datum von Hand zusammengesetzt statt Intl.DateTimeFormat
  zeilen.forEach((l, i) => {
    if (/get(Date|Month|FullYear|Hours|Minutes)\(\)/.test(l) && /[`+]|padStart|\$\{/.test(l)) add("Datum/Zeit von Hand formatiert", f, i + 1, l);
  });
  // Löschen ohne Rückfrage: rote Knöpfe in Dateien ohne Bestätigung
  if (/variant="destructive"/.test(src) && !/ConfirmDialog|confirm\(|Bestätig|rueckfrage|Rueckfrage|confirmDelete|bestaetig/i.test(src)) {
    add("Löschen ohne Rückfrage?", f, zeilen.findIndex((l) => l.includes('variant="destructive"')) + 1, "variant=destructive ohne Bestätigung in der Datei");
  }
  // Filter nur im Zustand (URL spiegelt ihn nicht)
  if (/"use client"/.test(src) && /useState[^\n]*\n?[^\n]*\b(set(Filter|Status|Query|Sort|Tab|Prio|Kategorie))\b|const \[(filter|status|query|sort|tab)\w*, set/.test(src) && !/useSearchParams|searchParams/.test(src)) {
    add("Filter/Reiter nur im Zustand, nicht in der URL", f, 1, "useState für Filter, kein useSearchParams");
  }
}

// Texte: gerade Anführungszeichen im Deutschen, drei Punkte statt Auslassungszeichen
for (const datei of ["lib/i18n/de.json", "lib/i18n/en.json"]) {
  const zeilen = fs.readFileSync(datei, "utf8").split("\n");
  zeilen.forEach((l, i) => {
    const wert = l.match(/^\s*"[^"]+":\s*"(.*)",?$/)?.[1] ?? "";
    if (datei.endsWith("de.json") && /\\"/.test(wert)) add("gerade Anführungszeichen im deutschen Text", datei, i + 1, wert);
    if (/\.\.\./.test(wert)) add("drei Punkte statt …", datei, i + 1, wert);
  });
}

for (const [regel, liste] of Object.entries(funde)) {
  console.log(`\n== ${regel} (${liste.length})`);
  liste.slice(0, 40).forEach((x) => console.log(x));
}

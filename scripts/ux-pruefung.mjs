// UX-Prüfung über alle Oberflächen (QS-013, Design-Session 24.09.2026).
//
//   node scripts/ux-pruefung.mjs
//
// Liest `app/` und `components/` und listet Stellen, die gegen die Regeln des
// Skills `/portal-design` verstossen könnten. Es ist eine **Liste zum
// Hinsehen, kein Test**: manche Treffer sind gewollt (ein `<h2>` in `.ct-h3`
// ist in Dialogen und bei dynamischen Titeln richtig; eine Seite „ohne Kopf"
// bekommt ihn oft aus einer Shell). Die Einordnung je Regel steht in
// `docs/ux-durchgang-2026-09-24.md`.

import fs from "node:fs"; import path from "node:path";
const files = []; const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (p.endsWith(".tsx")) files.push(p); } };
walk("app"); walk("components");
const bereich = (f) => (f.match(/^app\/\(([^)]+)\)/)?.[1]) ?? (f.startsWith("app/") ? f.split("/")[1] : f.split("/").slice(0,2).join("/"));
const funde = {};
const add = (regel, f, zeile, text) => ((funde[regel] ??= []).push(`${bereich(f).padEnd(18)} ${f}:${zeile}  ${text.trim().slice(0, 90)}`));
for (const f of files) {
  const src = fs.readFileSync(f, "utf8"); const z = src.split("\n");
  z.forEach((l, i) => {
    if (/<h2[^>]*className="[^"]*ct-h3/.test(l)) add("h2 als ct-h3", f, i + 1, l);
    if (/\boutline-none\b/.test(l) && !/focus-visible:outline|focus:outline|ring/.test(l)) add("outline-none ohne Ersatz", f, i + 1, l);
    if (/text-muted-soft/.test(l) && !/disabled|placeholder|aria-hidden/.test(l)) add("text-muted-soft (3,06:1) für Text", f, i + 1, l);
    if (/<button[^>]*>\s*$/.test(l) === false && /<button(?![^>]*aria-label)[^>]*>\s*<svg/.test(l)) add("Zeichen-Knopf ohne Namen", f, i + 1, l);
    if (/\[[0-9]+px\]/.test(l) && !f.includes("components/ui/") ) add("rohe px-Werte", f, i + 1, l);
    if (/#[0-9a-fA-F]{6}\b/.test(l) && !/KalenderMarken|brand\//.test(f) && !/^\s*(\/\/|\*)/.test(l)) add("roher Hex-Wert", f, i + 1, l);
  });
  if (f.endsWith("page.tsx") && f.startsWith("app/(")) {
    const hatKopf = /<(PageHeader|HeroBand)\b/.test(src) || /redirect\(|notFound\(|return <\w+Seite|return <WikiPage/.test(src);
    if (!hatKopf) add("Seite ohne Kopf", f, 1, "kein PageHeader/HeroBand");
    const k = [...src.matchAll(/<PageHeader\b([\s\S]*?)\/>/g)];
    if (k.length && k.every((m) => !/\bword=/.test(m[1])) ) add("Seitenkopf ohne Wort (QS-037)", f, 1, `${k.length} PageHeader`);
    const primaer = [...src.matchAll(/<(Button|ButtonLink)\b(?![^>]*variant=)/g)].length;
    if (primaer > 1) add("mehr als eine primäre Aktion?", f, 1, `${primaer} Knöpfe ohne variant`);
  }
}
for (const [regel, l] of Object.entries(funde)) { console.log(`\n== ${regel} (${l.length})`); l.slice(0, 40).forEach((x) => console.log(x)); }

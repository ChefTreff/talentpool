#!/usr/bin/env node
/**
 * Kontrastprüfung (WCAG 2.1) für Token-Paare.
 *
 *   node .claude/skills/portal-design/referenzen/kontrast.mjs            # Standardpaare des Portals
 *   node .claude/skills/portal-design/referenzen/kontrast.mjs #6262DC #FFFFFF
 *
 * Schwellen: 4.5 Fließtext · 3.0 Großtext (≥ 24 px oder ≥ 19 px fett)
 * und Bedienelement-Ränder (WCAG 1.4.11).
 */
const lin = (c) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const lum = (hex) => {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
export const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

const PAARE = [
  ["Fließtext auf Grund", "#081A35", "#F5F4F2", 4.5],
  ["Fließtext auf Karte", "#081A35", "#FFFFFF", 4.5],
  ["Hilfstext auf Grund", "#5C6878", "#F5F4F2", 4.5],
  ["Platzhalter auf Karte", "#8A94A6", "#FFFFFF", 4.5],
  ["Akzenttext auf Karte", "#6262DC", "#FFFFFF", 4.5],
  ["Akzenttext auf Grund", "#6262DC", "#F5F4F2", 4.5],
  ["Weiß auf Akzentfläche", "#FFFFFF", "#6262DC", 4.5],
  ["Off-White auf Akzentfläche", "#F5F4F2", "#6262DC", 4.5],
  ["Akzent als Rand/Fokus auf Karte", "#6262DC", "#FFFFFF", 3.0],
  ["Feldrand auf Karte", "#7F8A9C", "#FFFFFF", 3.0],
  ["Feldrand auf Grund", "#7F8A9C", "#F5F4F2", 3.0],
  ["Trennlinie auf Karte (dekorativ)", "#DCDFE5", "#FFFFFF", 0],
  ["Text auf Akzent-Soft", "#081A35", "#E8E8FC", 4.5],
  ["Success-Chip", "#0B7A5A", "#E7FAF3", 4.5],
  ["Warning-Chip", "#8A6100", "#FEF6DE", 4.5],
  ["Error-Chip", "#C22B2B", "#FDECEC", 4.5],
  ["Destructive-Fläche mit Weiß", "#FFFFFF", "#C22B2B", 4.5],
  ["Text auf Navy (Sidebar)", "#F5F4F2", "#081A35", 4.5],
  ["Hilfstext auf Navy", "#A0AAB9", "#081A35", 4.5],
  ["Akzent auf Navy (nur Fläche/Linie)", "#6262DC", "#081A35", 3.0],
  ["Navy auf Highlight-Pink", "#081A35", "#FF88CF", 4.5],
];

const direkt =
  process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
const args = process.argv.slice(2);
const zeilen = args.length >= 2 ? [["Eingabe", args[0], args[1], 4.5]] : PAARE;
let fehler = 0;
for (const [name, vg, hg, soll] of direkt ? zeilen : []) {
  const r = ratio(vg, hg);
  const ok = soll === 0 || r >= soll;
  if (!ok) fehler++;
  const marke = soll === 0 ? "–" : ok ? "ok" : "FEHLT";
  console.log(
    `${marke.padEnd(6)} ${r.toFixed(2).padStart(5)}:1  ${vg} auf ${hg}  ${name}${soll ? ` (Soll ${soll})` : ""}`,
  );
}
if (fehler) console.log(`\n${fehler} Paar(e) unter der Schwelle.`);

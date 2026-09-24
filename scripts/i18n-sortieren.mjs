// Sortiert die Wörterbücher alphabetisch (QS-047).
//
//   node scripts/i18n-sortieren.mjs            # sortiert lib/i18n/de.json und en.json an Ort und Stelle
//   node scripts/i18n-sortieren.mjs --pruefen  # schreibt nichts; Exit 1, wenn eine Datei nicht sortiert ist
//
// Vor jedem Push mit neuen Schlüsseln laufen lassen (AGENTS.md, Build-Checkliste
// Punkt 6) — `tests/woerterbuch.test.ts` bricht sonst im Gate. Idempotent: ein
// zweiter Lauf ändert nichts. Sortiert wird nach Codepunkt, Arrays behalten ihre
// Reihenfolge, die Schreibweise bleibt (zwei Leerzeichen, Zeilenende am Schluss).
import { readFileSync, writeFileSync } from "node:fs";
import { WOERTERBUECHER, formatiert, sortiert } from "./i18n-werkzeug.mjs";

const nurPruefen = process.argv.includes("--pruefen");
let unsortiert = 0;

for (const datei of WOERTERBUECHER) {
  const vorher = readFileSync(datei, "utf8");
  const nachher = formatiert(sortiert(JSON.parse(vorher)));
  if (vorher === nachher) {
    console.log(`${datei}: sortiert`);
    continue;
  }
  unsortiert++;
  if (nurPruefen) {
    console.log(`${datei}: NICHT sortiert — node scripts/i18n-sortieren.mjs`);
  } else {
    writeFileSync(datei, nachher);
    console.log(`${datei}: neu sortiert`);
  }
}

if (nurPruefen && unsortiert > 0) process.exit(1);

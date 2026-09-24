// Löst einen Konflikt in den Wörterbüchern (QS-047).
//
//   node scripts/i18n-zusammenfuehren.mjs
//
// Nach einem `git merge` oder `git rebase`, das in lib/i18n/de.json oder en.json
// anhält. Das Skript liest die drei Fassungen aus dem Git-Index — Stufe 1 (die
// gemeinsame Basis), Stufe 2 (HEAD) und Stufe 3 (die hereinkommende Seite) — und
// führt sie Schlüssel für Schlüssel zusammen: Neues von beiden Seiten kommt
// zusammen, eine Änderung nur einer Seite gilt. Danach wird sortiert und die
// Datei geschrieben. Nur wo **derselbe** Schlüssel auf beiden Seiten verschieden
// geändert wurde, bleibt eine Entscheidung: dann nennt das Skript die Pfade,
// schreibt vorläufig den Wert aus HEAD und endet mit Exit 1.
//
// Ohne Konflikt: `git add lib/i18n/de.json lib/i18n/en.json`, dann weiter mit
// `git rebase --continue` bzw. dem Merge-Commit.
//
// ---------------------------------------------------------------------------
// Optional, nicht eingerichtet — als Git-Merge-Treiber, dann löst Git die
// Wörterbücher bei jedem lokalen Merge und Rebase selbst:
//
//   .gitattributes:   lib/i18n/*.json merge=i18n
//   einmalig:         git config merge.i18n.name "Woerterbuecher zusammenfuehren"
//                     git config merge.i18n.driver "node scripts/i18n-zusammenfuehren.mjs --treiber %O %A %B"
//
// Die Einstellung liegt in .git/config und gilt damit für alle Worktrees dieses
// Macs. Merges auf GitHub selbst nutzen keinen Treiber — dort muss der Zweig
// vorher konfliktfrei sein. Mit `--treiber <basis> <aktuell> <andere>` schreibt
// das Skript das Ergebnis in <aktuell> und meldet Git mit Exit 1 einen echten
// Konflikt.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { WOERTERBUECHER, formatiert, sortiert, zusammenfuehren } from "./i18n-werkzeug.mjs";

function lesen(text) {
  return text.trim() === "" ? {} : JSON.parse(text);
}

function melden(datei, konflikte) {
  console.log(`${datei}: ${konflikte.length} echte(r) Konflikt(e) — beide Seiten haben denselben Schlüssel verschieden geändert:`);
  for (const p of konflikte) console.log(`  ${p}`);
  console.log("  Vorläufig steht dort der Wert aus HEAD; bitte prüfen, dann git add.");
}

const treiber = process.argv.indexOf("--treiber");
if (treiber !== -1) {
  const [basis, aktuell, andere] = process.argv.slice(treiber + 1, treiber + 4);
  const { wert, konflikte } = zusammenfuehren(
    lesen(readFileSync(basis, "utf8")),
    lesen(readFileSync(aktuell, "utf8")),
    lesen(readFileSync(andere, "utf8")),
  );
  writeFileSync(aktuell, formatiert(sortiert(wert)));
  if (konflikte.length) {
    melden(aktuell, konflikte);
    process.exit(1);
  }
  process.exit(0);
}

const stufe = (n, datei) => {
  try {
    return execFileSync("git", ["show", `:${n}:${datei}`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return ""; // Stufe fehlt: auf dieser Seite gab es die Datei nicht
  }
};

let offen = 0;
let geloest = 0;
for (const datei of WOERTERBUECHER) {
  const unmerged = execFileSync("git", ["ls-files", "-u", "--", datei], { encoding: "utf8" }).trim();
  if (!unmerged) {
    console.log(`${datei}: kein Konflikt`);
    continue;
  }
  const { wert, konflikte } = zusammenfuehren(lesen(stufe(1, datei)), lesen(stufe(2, datei)), lesen(stufe(3, datei)));
  writeFileSync(datei, formatiert(sortiert(wert)));
  if (konflikte.length) {
    melden(datei, konflikte);
    offen++;
  } else {
    console.log(`${datei}: zusammengeführt und sortiert`);
    geloest++;
  }
}

if (geloest && !offen) console.log("\nWeiter mit: git add lib/i18n/de.json lib/i18n/en.json");
if (offen) process.exit(1);

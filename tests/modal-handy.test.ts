import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";
import { compile } from "tailwindcss";

/**
 * QS-068 (Design, mit Plans Freigabe 05.10.): das Polster des `Modal` ist am Handy 16 px, ab 640 px 24. Bei 375 px
 * blieben von der Breite 327 px für den Inhalt. Alles, was gegen das Polster arbeitet (die Meldung unten, die klebende
 * Fußleiste), muss dieselben beiden Maße nehmen — sonst reicht es am Handy über den Rand hinaus und das Fenster wird
 * seitlich scrollbar. Deshalb gibt es `ModalFuss`, und dieser Test zählt nach, dass keine Seite das alte Maß von Hand setzt.
 */

const lies = (pfad: string) => readFileSync(pfad, "utf8");
const MODAL = lies("components/ui/Modal.tsx");

function quellen(ordner: string, treffer: string[] = []): string[] {
  for (const e of readdirSync(ordner, { withFileTypes: true })) {
    const pfad = `${ordner}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && e.name !== ".next" && !e.name.startsWith("vorschau-")) quellen(pfad, treffer);
    } else if (/\.tsx$/.test(e.name)) treffer.push(pfad);
  }
  return treffer;
}

describe("Modal-Polster (QS-068)", () => {
  it("16 px am Handy, 24 ab 640 px", () => {
    assert.match(MODAL, /rounded-ct-lg border bg-surface p-4 text-ink backdrop:bg-navy\/40 sm:p-6/);
    // Das alte feste Maß ist weg.
    assert.doesNotMatch(MODAL, /bg-surface p-6 text-ink/);
  });

  it("die Meldung unten läuft mit beiden Maßen bis an den Rand", () => {
    assert.match(
      MODAL,
      /sticky bottom-0 -mx-4 -mb-4 mt-4 border-t border-error-soft bg-error-soft px-4 py-3 ct-small text-error-ink sm:-mx-6 sm:-mb-6 sm:mt-6 sm:px-6/,
    );
  });

  it("`ModalFuss` klebt unten und nimmt dieselben beiden Maße, die Knöpfe brechen um", () => {
    assert.match(MODAL, /export function ModalFuss\(/);
    assert.match(
      MODAL,
      /"sticky -bottom-4 -mx-4 -mb-4 mt-4 flex flex-wrap gap-2 border-t bg-surface px-4 py-4 sm:-bottom-6 sm:-mx-6 sm:-mb-6 sm:mt-6 sm:px-6"/,
    );
  });

  it("Polster und Gegenmaße gehören zusammen: überall 4 und 6, nirgends 4 gegen 6", () => {
    // Ohne Kommentare: dort steht das alte Maß als Erklärung.
    const kopf = MODAL.slice(MODAL.indexOf("export function Modal("), MODAL.indexOf("export function ConfirmDialog"))
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const zahlen = (re: RegExp) => [...kopf.matchAll(re)].map((m) => m[1]);
    // Alle Maße ohne Präfix sind 4, alle mit `sm:` sind 6.
    for (const n of zahlen(/(?<![:\w-])-?(?:p|px|-mx|-mb|-bottom|mt)-(\d)\b/g)) assert.equal(n, "4");
    for (const n of zahlen(/sm:-?(?:p|px|-mx|-mb|-bottom|mt)-(\d)\b/g)) assert.equal(n, "6");
  });

  it("steht in der Sammelstelle des Kits", () => {
    assert.match(lies("components/ui/index.ts"), /export \{ Modal, ModalFuss, ConfirmDialog \} from "\.\/Modal";/);
  });
});

describe("Niemand arbeitet mehr von Hand gegen das Polster (QS-068)", () => {
  it("kein `-mx-6`, `-mb-6` und `-bottom-6` ohne `sm:` in Seiten und Bausteinen", () => {
    const verstoesse: string[] = [];
    for (const datei of quellen("app").concat(quellen("components"))) {
      lies(datei)
        .split("\n")
        .forEach((zeile, i) => {
          if (/^\s*(\/\/|\*|\/\*)/.test(zeile)) return;
          if (/(^|[\s"'`{])-(?:mx|mb|bottom)-6\b/.test(zeile)) verstoesse.push(`${datei}:${i + 1}`);
        });
    }
    assert.deepEqual(verstoesse, []);
  });

  it("das Personen-Fenster der Leads nutzt `ModalFuss` statt eigener Maße", () => {
    const fenster = lies("app/(speaker-leads)/speaker-leads/SpeakerFenster.tsx");
    assert.match(fenster, /import \{ Modal, ModalFuss \} from "@\/components\/ui\/Modal";/);
    assert.match(fenster, /<ModalFuss>[\s\S]*<\/ModalFuss>\s*<\/Modal>/);
  });
});

describe("Klassen (QS-068)", () => {
  it("Tailwind macht aus den neuen Klassen eine Regel (ein Tippfehler im Namen fiele sonst stillschweigend weg)", async () => {
    const theme = /@theme inline \{[\s\S]*?\n\}/.exec(lies("app/globals.css"))?.[0] ?? "";
    const tw = await compile(`@theme { --spacing: 0.25rem; --breakpoint-sm: 40rem; }\n${theme}\n@tailwind utilities;`);
    const klassen = [
      "p-4", "sm:p-6", "-mx-4", "-mb-4", "mt-4", "px-4", "-bottom-4",
      "sm:-mx-6", "sm:-mb-6", "sm:mt-6", "sm:px-6", "sm:-bottom-6",
    ];
    const css = tw.build(klassen);
    const fehlend = klassen.filter((k) => !css.includes(k.replace(/([:\[\]&>()*,.%/])/g, "\\$1")));
    assert.deepEqual(fehlend, []);
  });
});

import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";
import { compile } from "tailwindcss";

/**
 * QS-068 (Design, mit Plans Freigabe 05.10.): das Polster des `Modal` ist am Handy 16 px, ab 640 px 24. Bei 375 px
 * blieben von der Breite 327 px für den Inhalt. Alles, was gegen das Polster arbeitet (die Meldung unten, die klebende
 * Fußleiste), muss dieselben beiden Maße nehmen — sonst reicht es am Handy über den Rand hinaus und das Fenster wird
 * seitlich scrollbar. Deshalb gibt es `ModalFuss`, und dieser Test zählt nach, dass keine Seite das alte Maß von Hand setzt.
 *
 * Folge (Plan, 05.10.): die Meldung (`error`) steht im Fuß über den Knöpfen, wie beim `Drawer`. Als eigene Leiste neben
 * der Fußleiste deckte sie die Knöpfe zu (bei 375 px gemessen: 85 px). Mit einem Fuß gibt es nur noch die Meldung im
 * Fuß, ohne Fuß nur die eigene Leiste — nie beide.
 */

const lies = (pfad: string) => readFileSync(pfad, "utf8");
// Die Erklärungen im Kopf nennen die Klassen und `role="alert"` ebenfalls; gezählt wird nur der Code.
const ohneKommentare = (quelle: string) => quelle.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
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

  it("die Meldung hat eine Gestalt — ob sie als Leiste klebt oder im Fuß steht — und ist das einzige `role=\"alert\"` der Datei", () => {
    assert.match(MODAL, /function Meldung\(/);
    assert.match(MODAL, /"border-t border-error-soft bg-error-soft px-4 py-3 ct-small text-error-ink sm:px-6"/);
    // Zwei Schreibweisen der Meldung liefen auseinander; sie steht an einer Stelle.
    assert.equal((ohneKommentare(MODAL).match(/role="alert"/g) ?? []).length, 1);
  });

  it("die eigene Leiste ohne Fuß dockt bündig am Fensterrand an und läuft mit beiden Maßen bis an den Rand", () => {
    // `bottom-0` klebte am Inhaltsrand, 16 px über dem Fensterrand (Polster + Rand: 17 px gemessen); der Fuß gleicht
    // das Polster mit `-bottom-4` aus, die Leiste genauso.
    assert.match(
      MODAL,
      /<Meldung className="sticky -bottom-4 -mx-4 -mb-4 mt-4 sm:-bottom-6 sm:-mx-6 sm:-mb-6 sm:mt-6">\{error\}<\/Meldung>/,
    );
    assert.doesNotMatch(ohneKommentare(MODAL), /sticky bottom-0/);
  });

  it("`ModalFuss` klebt unten und nimmt dieselben beiden Maße, die Knöpfe brechen um", () => {
    assert.match(MODAL, /export function ModalFuss\(/);
    // Die Hülle klebt und trägt die Gegenmaße; die Zeile mit den Knöpfen trägt Rand, Grund und Polster.
    assert.match(MODAL, /className="sticky -bottom-4 -mx-4 -mb-4 mt-4 sm:-bottom-6 sm:-mx-6 sm:-mb-6 sm:mt-6"/);
    assert.match(MODAL, /cn\("flex flex-wrap gap-2 border-t bg-surface px-4 py-4 sm:px-6", className\)/);
  });

  it("Polster und Gegenmaße gehören zusammen: überall 4 und 6, nirgends 4 gegen 6", () => {
    // Ohne Kommentare: dort steht das alte Maß als Erklärung.
    const kopf = ohneKommentare(
      MODAL.slice(MODAL.indexOf("function Meldung("), MODAL.indexOf("export function ConfirmDialog")),
    );
    const zahlen = (re: RegExp) => [...kopf.matchAll(re)].map((m) => m[1]);
    // Alle Maße ohne Präfix sind 4, alle mit `sm:` sind 6.
    for (const n of zahlen(/(?<![:\w-])-?(?:p|px|-mx|-mb|-bottom|mt)-(\d)\b/g)) assert.equal(n, "4");
    for (const n of zahlen(/sm:-?(?:p|px|-mx|-mb|-bottom|mt)-(\d)\b/g)) assert.equal(n, "6");
  });

  it("steht in der Sammelstelle des Kits", () => {
    assert.match(lies("components/ui/index.ts"), /export \{ Modal, ModalFuss, ConfirmDialog \} from "\.\/Modal";/);
  });
});

describe("Die Meldung steht im Fuß, nie daneben (QS-068, Folge)", () => {
  const code = ohneKommentare(MODAL);
  const modal = code.slice(code.indexOf("export function Modal("), code.indexOf("export function ModalFuss("));
  const fuss = code.slice(code.indexOf("export function ModalFuss("), code.indexOf("export function ConfirmDialog"));

  it("der Fuß zeigt die Meldung des Fensters über der Zeile mit den Knöpfen", () => {
    assert.match(fuss, /\{kontext\?\.error && <Meldung>\{kontext\.error\}<\/Meldung>\}/);
    assert.ok(fuss.indexOf("<Meldung>") < fuss.indexOf("flex flex-wrap gap-2"), "die Meldung steht vor den Knöpfen");
  });

  it("das Fenster zeichnet seine eigene Leiste nur, solange kein Fuß da ist", () => {
    assert.match(modal, /\{error && fuesse === 0 && \(/);
  });

  it("der Fuß meldet sich beim Einhängen an und beim Aushängen ab — mit stabilem Rückruf, nicht bei jedem Zeichnen", () => {
    assert.match(fuss, /const ref = useCallback\(\(el: HTMLDivElement \| null\) => anmelden\?\.\(el !== null\), \[anmelden\]\);/);
    assert.match(fuss, /<div ref=\{ref\} className="sticky/);
    // Gezählt statt gemerkt: hängt ein Fuß aus, während ein zweiter steht, bleibt die Meldung beim zweiten.
    assert.match(modal, /const fussAnmelden = useCallback\(\(da: boolean\) => setFuesse\(\(n\) => n \+ \(da \? 1 : -1\)\), \[\]\);/);
  });

  it("der Kontext reicht die Meldung und die Anmeldung durch und bleibt gleich, solange sich die Meldung nicht ändert", () => {
    assert.match(modal, /const kontext = useMemo\(\(\) => \(\{ error, fussAnmelden \}\), \[error, fussAnmelden\]\);/);
    assert.match(modal, /<ModalKontext\.Provider value=\{kontext\}>\{children\}<\/ModalKontext\.Provider>/);
  });

  it("ein Fuß ohne Fenster drumherum bleibt eine Fußleiste ohne Meldung (kein Absturz ohne Kontext)", () => {
    assert.match(code, /const ModalKontext = createContext<\{[\s\S]*?\} \| null>\(null\);/);
    assert.match(fuss, /const anmelden = kontext\?\.fussAnmelden;/);
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
    // Der Import darf weitere Bausteine des Moduls tragen (LEAD-055: `ConfirmDialog` für „Änderungen verwerfen?“).
    assert.match(fenster, /import \{[^}]*\bModalFuss\b[^}]*\} from "@\/components\/ui\/Modal";/);
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

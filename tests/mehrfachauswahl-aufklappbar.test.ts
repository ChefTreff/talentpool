import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { compile } from "tailwindcss";
import { gewaehlteBeschriftungen, nachListeSortiert, unbekannteWerte, type AuswahlOption } from "@/components/ui/auswahl";

/**
 * PART-128 (Konrad & Leopold 05.10.): „Wen wünscht ihr euch?" der Company Tour zeigte 27 Kästchen auf einmal — am Handy
 * 1064 px hoch (gemessen 08.10.). `MehrfachAuswahl` bekommt eine zweite, aufklappbare Gestalt: zugeklappt eine Zeile mit
 * der Zusammenfassung, ein Klick öffnet die Kästchen. Die Fassung mit Suche bleibt, wie sie ist — fünf Seiten bauen darauf.
 *
 * Es gibt keinen DOM-Testlauf im Repo: hier steht, was am Quelltext und an den reinen Hilfen feststehen muss; Öffnen,
 * Tastatur und Maße sind im Browser gemessen (PR-Beschreibung).
 */

const lies = (pfad: string) => readFileSync(pfad, "utf8");
const ohneKommentare = (quelle: string) => quelle.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const QUELLE = ohneKommentare(lies("components/ui/MehrfachAuswahl.tsx"));
const ANFANG = QUELLE.indexOf("function AufklappAuswahl(");
const ENDE = QUELLE.indexOf("function normalisieren(");
/** Nur der Körper der aufklappbaren Fassung — die Fassung mit Suche enthält andere Dinge (Fokus, Tastatur). */
const AUFKLAPP = QUELLE.slice(ANFANG, ENDE);
const SUCHE = QUELLE.slice(QUELLE.indexOf("function SuchAuswahl("), ANFANG);

const FACH: AuswahlOption[] = [
  { value: "bwl", label: "BWL" },
  { value: "fin", label: "Finance/VWL" },
  { value: "wi", label: "Wirtschaftsinformatik" },
  { value: "med", label: "Marketing/Medien" },
];

describe("Die Wahl in der Reihenfolge der Liste (auswahl.ts)", () => {
  it("die Zusammenfassung folgt der Liste, nicht der Reihenfolge, in der gewählt wurde", () => {
    assert.deepEqual(gewaehlteBeschriftungen(FACH, ["med", "bwl"]), ["BWL", "Marketing/Medien"]);
    assert.deepEqual(gewaehlteBeschriftungen(FACH, ["bwl", "med"]), ["BWL", "Marketing/Medien"]);
  });

  it("nichts gewählt: keine Beschriftungen (die Zeile zeigt dann den Text aus `leer`)", () => {
    assert.deepEqual(gewaehlteBeschriftungen(FACH, []), []);
    assert.deepEqual(nachListeSortiert(FACH, []), []);
  });

  it("ein Wert, den die Liste nicht kennt, bleibt sichtbar: hinten, mit seinem Schlüssel, einmal", () => {
    assert.deepEqual(unbekannteWerte(FACH, ["alt", "bwl", "alt", "neu"]), ["alt", "neu"]);
    assert.deepEqual(gewaehlteBeschriftungen(FACH, ["alt", "wi", "bwl"]), ["BWL", "Wirtschaftsinformatik", "alt"]);
  });

  it("alles bekannt: keine unbekannten Werte", () => {
    assert.deepEqual(unbekannteWerte(FACH, ["bwl", "fin"]), []);
  });

  it("abgewählt und wieder gewählt ergibt dieselbe Liste (ein Formular, das Listen vergleicht, sieht keine Änderung)", () => {
    const gespeichert = nachListeSortiert(FACH, ["bwl", "med"]);
    const abgewaehlt = nachListeSortiert(FACH, gespeichert.filter((v) => v !== "bwl"));
    const wiederGewaehlt = nachListeSortiert(FACH, [...abgewaehlt, "bwl"]);
    assert.deepEqual(wiederGewaehlt, gespeichert);
    // Genau das vergleicht `tourAenderungen` (JSON.stringify) — ohne die feste Reihenfolge stünde hier ["med","bwl"].
    assert.equal(JSON.stringify(wiederGewaehlt), JSON.stringify(["bwl", "med"]));
  });

  it("ein unbekannter Wert wandert beim Umschalten nicht nach vorn", () => {
    assert.deepEqual(nachListeSortiert(FACH, ["alt", "med", "bwl"]), ["bwl", "med", "alt"]);
  });
});

describe("MehrfachAuswahl hat zwei Gestalten, die Fassung mit Suche bleibt", () => {
  it("die Weiche: `aufklappbar` ist ein Wahrheitswert, ohne ihn gilt die Fassung mit Suche", () => {
    assert.match(QUELLE, /export function MehrfachAuswahl\(props: MitSuche \| Aufklappbar\)/);
    assert.match(QUELLE, /props\.aufklappbar === true \? <AufklappAuswahl \{\.\.\.props\} \/> : <SuchAuswahl \{\.\.\.props\} \/>/);
    assert.match(QUELLE, /aufklappbar\?: false;/);
    assert.match(QUELLE, /aufklappbar: true;/);
  });

  it("die aufklappbare Fassung braucht den Text für „nichts gewählt“, die Fassung mit Suche ihre Texte `t`", () => {
    assert.match(QUELLE, /type Aufklappbar = Gemeinsam & \{[^}]*\bleer: string;/);
    assert.match(QUELLE, /type MitSuche = Gemeinsam & \{[^}]*t: \{ remove: string; noHits: string \};/);
  });

  it("die Fassung mit Suche trägt weiter ihre Combobox: Rolle, Liste, aktive Zeile, Tastatur", () => {
    assert.match(SUCHE, /role="combobox"/);
    assert.match(SUCHE, /role="listbox"/);
    assert.match(SUCHE, /aria-multiselectable="true"/);
    assert.match(SUCHE, /aria-activedescendant=\{aktiveId\}/);
    assert.match(SUCHE, /e\.key === "Backspace"/);
  });

  it("der Kit-Eingang kennt weiter `MehrfachAuswahl` und `AuswahlOption`", () => {
    assert.match(lies("components/ui/index.ts"), /export \{ MehrfachAuswahl, type AuswahlOption \} from "\.\/MehrfachAuswahl";/);
    assert.match(lies("components/ui/MehrfachAuswahl.tsx"), /export type \{ AuswahlOption \};/);
  });
});

describe("Die aufklappbare Fassung: Aufbau", () => {
  it("der Knopf trägt die `id` des Felds, `aria-expanded` und `aria-controls` (die Beschriftung `Field htmlFor` benennt ihn)", () => {
    assert.match(AUFKLAPP, /<button\s+type="button"\s+id=\{id\}\s+aria-expanded=\{auf\}\s+aria-controls=\{listeId\}/);
  });

  it("die Zusammenfassung hängt als Beschreibung am Knopf, zusammen mit dem Hinweis des Aufrufers", () => {
    assert.match(AUFKLAPP, /aria-describedby=\{\[zeileId, describedBy\]\.filter\(Boolean\)\.join\(" "\)\}/);
    assert.match(AUFKLAPP, /<span id=\{zeileId\}/);
  });

  it("Touch-Ziel wie bei Eingabefeld und Auswahl: 40 px am Desktop, am Handy mindestens 44 (Skill-Regel 7), in einer Zeile", () => {
    const zeile = AUFKLAPP.split("\n").find((z) => /\bh-10\b/.test(z)) ?? "";
    assert.match(zeile, /h-10[^"]*pointer-coarse:min-h-11/);
  });

  it("die Liste bleibt im Dokument (`hidden`), damit `aria-controls` immer ein Ziel hat; geschlossen ist sie nicht fokussierbar", () => {
    assert.match(AUFKLAPP, /<div id=\{listeId\} hidden=\{!auf\}>/);
  });

  it("die Kästchen sind eine Gruppe, die nach dem Feld benannt ist, und bestehen aus dem Kit-`Checkbox` (44 px am Handy)", () => {
    assert.match(AUFKLAPP, /<div role="group" aria-labelledby=\{id\}/);
    assert.match(AUFKLAPP, /<Checkbox\s+key=\{o\.value\}\s+label=\{o\.label\}/);
    assert.doesNotMatch(AUFKLAPP, /type="checkbox"/);
  });

  it("jede Zeile der Liste ist ein Kästchen mit Beschriftung: auch ein unbekannter Wert hat eine Zeile (abwählbar)", () => {
    assert.match(AUFKLAPP, /const zeilen = \[\.\.\.options, \.\.\.unbekannteWerte\(options, value\)\.map\(\(v\) => \(\{ value: v, label: v \}\)\)\];/);
  });

  it("das Umschalten gibt die Wahl in der Reihenfolge der Liste zurück", () => {
    assert.match(AUFKLAPP, /onChange\(nachListeSortiert\(options, value\.includes\(v\) \? value\.filter\(\(x\) => x !== v\) : \[\.\.\.value, v\]\)\)/);
  });

  it("die Zahl steht ab zwei Einträgen daneben, als Kit-`Badge`, und nur für Augen (`aria-hidden`)", () => {
    assert.match(AUFKLAPP, /beschriftungen\.length > 1 && \(\s*<span aria-hidden className="shrink-0">\s*<Badge tone="accent">\{beschriftungen\.length\}<\/Badge>/);
  });

  it("nichts gewählt zeigt den Text des Aufrufers in der gedämpften Farbe; gesperrt ebenso", () => {
    assert.match(AUFKLAPP, /text && !disabled \? "text-ink" : "text-muted"/);
    assert.match(AUFKLAPP, /\{text \|\| leer\}/);
  });

  it("der Fehlerzustand färbt den Rand wie bei `Input`, gesperrt legt die Hover-Fläche hinter das Feld", () => {
    assert.match(AUFKLAPP, /invalid \? "border-error" : "border-border-strong"/);
    assert.match(AUFKLAPP, /disabled \? "bg-surface-hover" : "bg-surface"/);
  });

  it("gesperrt sperrt die Kästchen, nicht den Knopf (wer nichts ändern darf, soll lesen können, was gewählt ist)", () => {
    assert.match(AUFKLAPP, /<Checkbox[^>]*disabled=\{disabled\}/);
    assert.doesNotMatch(AUFKLAPP.slice(AUFKLAPP.indexOf("<button"), AUFKLAPP.indexOf("</button>")), /disabled=\{disabled\}/);
  });

  it("nur eine Liste ohne jeden Eintrag sperrt auch den Knopf: es gäbe nichts zu öffnen", () => {
    assert.match(AUFKLAPP, /<button[^>]*\bdisabled=\{zeilen\.length === 0\}/);
  });

  it("Bewegung nur als Feedback (Skill-Regel 6): das Zeichen dreht sich ohne Übergang, nichts animiert die Höhe", () => {
    assert.doesNotMatch(AUFKLAPP, /transition|animate-|duration-/);
    assert.match(AUFKLAPP, /auf && "rotate-180"/);
  });

  it("die Liste fängt keine Tasten ab und schließt nicht beim Verlassen: kein Blur-Handler, kein Escape (ein Dialog darum schließt mit Escape wie immer)", () => {
    assert.doesNotMatch(AUFKLAPP, /onBlur|onKeyDown|Escape/);
  });

  it("keine festen Maße in eckigen Klammern (Skill-Regel 2)", () => {
    assert.doesNotMatch(AUFKLAPP, /\[\d+(?:px|rem|ch|vh|vw)\]/);
  });

  it("kein deutscher Text im Baustein: die Texte kommen vom Aufrufer (`leer`, die Beschriftung des Felds)", () => {
    // Zwischen Tags oder in Anführungszeichen stünde sonst ein Wort — erlaubt sind nur Klassen und Ausdrücke.
    assert.doesNotMatch(AUFKLAPP, />\s*[A-ZÄÖÜ][a-zäöüß]+[^<{]*</);
  });
});

describe("Die Kit-Schau zeigt beide Zustände, Wörterbuch DE und EN", () => {
  const schau = lies("components/ui/KitSchau.tsx");

  it("zugeklappt mit Wahl und beim Laden offen, mit dem Hinweis als Beschreibung", () => {
    assert.match(schau, /<MehrfachAuswahl\s+aufklappbar\s+id="kit-aufklappbar"/);
    assert.match(schau, /<MehrfachAuswahl\s+aufklappbar\s+offen\s+id="kit-aufklappbar-offen"/);
    assert.match(schau, /describedBy="kit-aufklappbar-hint"/);
  });

  for (const sprache of ["de", "en"] as const) {
    it(`${sprache}: alle Kit-Texte der aufklappbaren Auswahl stehen im Wörterbuch`, () => {
      const kit = (JSON.parse(lies(`lib/i18n/${sprache}.json`)) as { kit: Record<string, string> }).kit;
      for (const schluessel of ["foldEmpty", "foldHint", "foldLabel", "foldOpenLabel", "foldOpenOptions", "foldOptions"]) {
        assert.equal(typeof kit[schluessel], "string", `${sprache}: kit.${schluessel}`);
        assert.ok(kit[schluessel].length > 0, `${sprache}: kit.${schluessel} nicht leer`);
      }
      assert.ok(kit.foldOptions.split(" · ").length >= 6, "genug Einträge, um die Zeile zu füllen");
    });
  }
});

/**
 * Alle Klassen, die der Baustein selbst setzt: die Zeichenketten in `className={…}` und `className="…"`.
 * Aus dem Quelltext gelesen statt von Hand getippt — ein Tippfehler im Baustein soll hier auffallen, nicht ein
 * Tippfehler in einer Liste im Test.
 */
function klassenAus(quelle: string): string[] {
  const klassen = new Set<string>();
  for (const m of quelle.matchAll(/className=/g)) {
    const ab = quelle.slice(m.index + m[0].length);
    let ausdruck: string;
    if (ab.startsWith('"')) {
      ausdruck = ab.slice(0, ab.indexOf('"', 1) + 1);
    } else {
      let tiefe = 0;
      let i = 0;
      do {
        if (ab[i] === "{") tiefe++;
        if (ab[i] === "}") tiefe--;
        i++;
      } while (tiefe > 0 && i < ab.length);
      ausdruck = ab.slice(0, i);
    }
    for (const z of ausdruck.matchAll(/"([^"]*)"/g)) for (const k of z[1].split(/\s+/).filter(Boolean)) klassen.add(k);
  }
  return [...klassen];
}

describe("Tailwind kennt alle Klassen der aufklappbaren Fassung", () => {
  it("die Klassen kommen aus dem Quelltext (nicht aus einer Liste im Test) und sind nicht wenige", () => {
    const klassen = klassenAus(AUFKLAPP);
    assert.ok(klassen.length >= 25, `nur ${klassen.length} Klassen gefunden`);
    for (const k of ["pointer-coarse:min-h-11", "sm:columns-2", "break-inside-avoid", "rotate-180", "rounded-t-ct-md", "border-error"]) {
      assert.ok(klassen.includes(k), `${k} fehlt in der Fundliste`);
    }
  });

  it("jede dieser Klassen ergibt eine Regel (ein Tippfehler im Namen fiele sonst stillschweigend weg)", async () => {
    const theme = /@theme inline \{[\s\S]*?\n\}/.exec(lies("app/globals.css"))?.[0] ?? "";
    const tw = await compile(`@theme { --spacing: 0.25rem; --breakpoint-sm: 40rem; }\n${theme}\n@tailwind utilities;`);
    const klassen = klassenAus(AUFKLAPP);
    const css = tw.build(klassen);
    const fehlend = klassen.filter((k) => !css.includes(k.replace(/([:\[\]&>()*,.%/])/g, "\\$1")));
    assert.deepEqual(fehlend, []);
  });
});

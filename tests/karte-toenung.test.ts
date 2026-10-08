import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";
import { cn, kartenFlaeche, kartenPadding } from "@/components/ui/cn";

/**
 * QS-073 (Befund Partner-Chat, #381): `<Card className="bg-accent-soft">` blieb weiß. `bg-surface` der Karte stand im
 * erzeugten CSS hinter `bg-accent-soft` — die Hintergründe stehen dort alphabetisch, wer vor „surface“ kommt, verliert
 * (`accent-soft`, `error-soft`, `success-soft`), wer dahinter kommt, gewinnt (`warning-soft`). Gemessen am 08.10.2026.
 *
 * Wie bei `kartenPadding` (QS-055): die Karte setzt ihre weiße Fläche nur, wenn der Aufrufer keine eigene mitbringt.
 * Es gibt keinen DOM-Testlauf im Repo; die gemessenen Farben stehen in der PR-Beschreibung.
 */

const lies = (pfad: string) => readFileSync(pfad, "utf8");
const ohneKommentare = (quelle: string) => quelle.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("kartenFlaeche: weiß, wenn der Aufrufer nichts anderes will", () => {
  it("ohne eigene Fläche steht `bg-surface` da", () => {
    assert.equal(kartenFlaeche(undefined), "bg-surface");
    assert.equal(kartenFlaeche(""), "bg-surface");
    assert.equal(kartenFlaeche("mb-6"), "bg-surface");
    assert.equal(kartenFlaeche("p-0 overflow-x-auto"), "bg-surface");
  });

  it("eine eigene Fläche ersetzt sie — auch mit Rand, vor und hinter anderen Klassen", () => {
    assert.equal(kartenFlaeche("bg-accent-soft"), false);
    assert.equal(kartenFlaeche("border-accent-soft bg-accent-soft"), false);
    assert.equal(kartenFlaeche("mb-6 bg-warning-soft px-4"), false);
    assert.equal(kartenFlaeche("bg-error-soft"), false);
    assert.equal(kartenFlaeche("bg-success-soft"), false);
  });

  it("auch die Fassung mit Ausrufezeichen und die weiße Fläche selbst zählen als eigene Fläche", () => {
    assert.equal(kartenFlaeche("!bg-accent-soft"), false);
    assert.equal(kartenFlaeche("bg-surface-hover"), false);
  });

  it("eine Fläche nur ab einer Breite oder beim Darüberfahren ersetzt die weiße nicht (sie steht in einer Medienabfrage)", () => {
    assert.equal(kartenFlaeche("sm:bg-accent-soft"), "bg-surface");
    assert.equal(kartenFlaeche("hover:bg-surface-hover"), "bg-surface");
    assert.equal(kartenFlaeche("md:bg-warning-soft lg:bg-error-soft"), "bg-surface");
  });

  it("ein Wort, das nur auf `bg-` endet oder es enthält, ist keine Fläche", () => {
    assert.equal(kartenFlaeche("sbg-foo"), "bg-surface");
    assert.equal(kartenFlaeche("data-bg-x"), "bg-surface");
  });

  it("zusammen mit `cn` steht nie beides am Element", () => {
    for (const k of ["", "mb-6", "border-accent-soft bg-accent-soft", "bg-warning-soft", "sm:bg-accent-soft"]) {
      const klassen = cn("rounded-ct-lg border", kartenFlaeche(k), kartenPadding(k), k).split(" ");
      const flaechen = klassen.filter((x) => /^!?bg-/.test(x));
      assert.equal(flaechen.length, 1, `className="${k}" → ${flaechen.join(", ")}`);
    }
  });
});

describe("Card benutzt es", () => {
  const CARD = ohneKommentare(lies("components/ui/Card.tsx"));

  it("die Karte trägt `bg-surface` nicht mehr fest im Grundstil, sondern über `kartenFlaeche(className)`", () => {
    assert.match(CARD, /import \{ cn, kartenFlaeche, kartenPadding, kartenRand \} from "\.\/cn";/);
    assert.match(CARD, /"rounded-ct-lg border",\s*kartenFlaeche\(className\),\s*kartenPadding\(className\),/);
    assert.doesNotMatch(CARD.slice(0, CARD.indexOf("export function CardHeader")), /"rounded-ct-lg border bg-surface"/);
  });

  it("die anderen Karten-Bausteine der Datei bleiben, wie sie sind (`StatCard` hat keine className)", () => {
    assert.match(CARD, /<div className="rounded-ct-lg border bg-surface p-6">/);
  });
});

describe("Jeder Aufrufer, der einer Karte eine Fläche mitgibt, meint eine Tönung (Stellen geprüft, QS-073)", () => {
  /** Alle `<Card …className=… bg-…>` unter app/ und components/ (ohne lokale Vorschauseiten). */
  function karten(ordner: string, treffer: { datei: string; klassen: string }[] = []) {
    for (const e of readdirSync(ordner, { withFileTypes: true })) {
      const pfad = `${ordner}/${e.name}`;
      if (e.isDirectory()) {
        if (!["node_modules", ".next"].includes(e.name) && !e.name.startsWith("vorschau-")) karten(pfad, treffer);
      } else if (e.name.endsWith(".tsx")) {
        const text = lies(pfad);
        for (const m of text.matchAll(/<Card\b/g)) {
          let tiefe = 0;
          let i = m.index + m[0].length;
          while (i < text.length && !(text[i] === ">" && tiefe === 0 && text[i - 1] !== "=")) {
            if (text[i] === "{") tiefe++;
            if (text[i] === "}") tiefe--;
            i++;
          }
          const tag = text.slice(m.index, i + 1);
          const klassen = /className=(?:"([^"]*)"|\{([\s\S]*?)\}(?=\s|>|\/))/.exec(tag);
          const inhalt = klassen?.[1] ?? klassen?.[2] ?? "";
          if (/(^|[\s"`'(])!?bg-[a-z]/.test(inhalt)) treffer.push({ datei: pfad, klassen: inhalt.replace(/\s+/g, " ").trim() });
        }
      }
    }
    return treffer;
  }

  it("heute gehören drei Stellen dazu (Frist-Karte zweimal, Shop-Hinweis); jede Tönung steht mit dem Rand ihrer Familie", () => {
    const treffer = karten("app").concat(karten("components")).filter((t) => !t.datei.endsWith("KitSchau.tsx"));
    const dateien = treffer.map((t) => t.datei);
    for (const bekannt of ["app/(partner)/partner/shop/PhaseBanner.tsx", "components/ui/DeadlineCard.tsx"]) {
      assert.ok(dateien.includes(bekannt), `${bekannt} gibt der Karte eine Tönung mit`);
    }
    assert.equal(dateien.filter((d) => d === "components/ui/DeadlineCard.tsx").length, 2, "beide Fassungen der Frist-Karte");
    // Neue Stellen dürfen dazukommen — aber nie eine Tönung ohne ihren Rand (sie sähe nach Fehler aus).
    for (const t of treffer) {
      const familien = [...t.klassen.matchAll(/bg-(accent|warning|error|success)-soft/g)].map((m) => m[1]);
      assert.ok(familien.length > 0, `${t.datei}: eine getönte Fläche der Familien accent, warning, error oder success`);
      for (const f of familien) assert.match(t.klassen, new RegExp(`border-${f}-soft`), `${t.datei}: Rand der Familie ${f}`);
    }
  });

  it("der Text auf der Tönung trägt den dunklen Ton derselben Familie (geprüfte Paare: 5,65 : 1 und 5,13 : 1)", () => {
    const frist = lies("components/ui/DeadlineCard.tsx");
    assert.match(frist, /text-accent-deep/);
    const hinweis = lies("app/(partner)/partner/shop/PhaseBanner.tsx");
    // Überschrift und Satz: beide wechseln mit dem Zustand zwischen Warn- und Akzentton.
    assert.equal((hinweis.match(/closed \? "text-warning-ink" : "text-accent-deep"/g) ?? []).length, 2);
  });

  it("die Kit-Galerie zeigt die drei Karten: weiß, Hinweis, Warnung", () => {
    const schau = lies("components/ui/KitSchau.tsx");
    assert.match(schau, /<Card className="border-accent-soft bg-accent-soft">/);
    assert.match(schau, /<Card className="border-warning-soft bg-warning-soft">/);
    for (const sprache of ["de", "en"]) {
      const kit = (JSON.parse(lies(`lib/i18n/${sprache}.json`)) as { kit: Record<string, string> }).kit;
      for (const k of ["sCards", "cardPlain", "cardPlainBody", "cardAccent", "cardAccentBody", "cardWarning", "cardWarningBody"]) {
        assert.ok(typeof kit[k] === "string" && kit[k].length > 0, `${sprache}: kit.${k}`);
      }
    }
  });
});

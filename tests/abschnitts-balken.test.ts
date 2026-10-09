import { strict as assert } from "node:assert";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { aktiverAbschnitt } from "@/components/ui/abschnitts-spion";

/**
 * ADM-093 (Konrad 08.10.2026, Vorschlag 10-09 Abschnitt 4): „Auf dieser Seite“ als **klebender Balken** unter dem Seitenkopf statt
 * einer Fläche neben den Stammdaten. Das hier ist die **Kit-Vorarbeit** (Plan 09.10.): `AbschnittsNavigation variante="balken"`.
 * **Keine Seite ist umgestellt** — das entscheidet Konrad mit K-95; ein Test hält das fest, damit es nicht still geschieht.
 *
 * Es gibt keinen DOM-Testlauf im Repo: die Regel, welcher Abschnitt im Bild ist, läuft hier wirklich (`aktiverAbschnitt`), die
 * Gestalt steht im Quelltext, Bild und Maße in der PR-Beschreibung.
 */

const src = (p: string) => readFileSync(p, "utf8");
const ohneKommentare = (q: string) => q.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const balken = ohneKommentare(src("components/ui/AbschnittsBalken.tsx"));
const navigation = ohneKommentare(src("components/ui/Abschnitte.tsx"));
const css = src("app/globals.css");

describe("aktiverAbschnitt: welcher Abschnitt ist im Bild", () => {
  const LINIE = 80;

  it("ohne Abschnitte (oder wenn keiner auf der Seite steht) gilt der erste Eintrag", () => {
    assert.equal(aktiverAbschnitt([], LINIE), 0);
    assert.equal(aktiverAbschnitt([null, null], LINIE), 0);
    assert.equal(aktiverAbschnitt([null, null], LINIE, true), 0);
  });

  it("am Seitenanfang, wenn noch alles unter der Linie liegt, gilt der oberste", () => {
    assert.equal(aktiverAbschnitt([300, 700, 1100], LINIE), 0);
    assert.equal(aktiverAbschnitt([1100, 300, 700], LINIE), 1, "nach der Lage, nicht nach der Reihenfolge der Liste");
  });

  it("mittendrin gilt der letzte, den die Linie schon erreicht hat", () => {
    assert.equal(aktiverAbschnitt([-300, -50, 40, 400], LINIE), 2);
    assert.equal(aktiverAbschnitt([-900, -300, 60, 80.5], LINIE), 2, "knapp unter der Linie zählt noch nicht");
  });

  it("genau auf der Linie zählt als erreicht (so landet ein Sprung über den Anker)", () => {
    assert.equal(aktiverAbschnitt([-500, 80, 600], LINIE), 1);
  });

  it("weit unten, wenn alle schon oberhalb liegen, gilt der unterste", () => {
    assert.equal(aktiverAbschnitt([-900, -500, -100], LINIE), 2);
  });

  it("fehlende Abschnitte (nicht auf der Seite) werden übersprungen", () => {
    assert.equal(aktiverAbschnitt([null, 20, null, 500], LINIE), 1);
    assert.equal(aktiverAbschnitt([-100, null, -20], LINIE), 2);
  });

  it("die Reihenfolge der Liste ist nicht die Reihenfolge der Seite: es zählt die Lage", () => {
    assert.equal(aktiverAbschnitt([50, -200, 400], LINIE), 0);
    assert.equal(aktiverAbschnitt([-10, -200, 40], LINIE), 2);
  });

  it("am Seitenende gilt der unterste Abschnitt, auch wenn er die Linie nie erreicht", () => {
    assert.equal(aktiverAbschnitt([-900, -400, 300, 600], LINIE, true), 3);
    assert.equal(aktiverAbschnitt([-900, -400, 300, 600], LINIE, false), 1);
    assert.equal(aktiverAbschnitt([null, 100, null], LINIE, true), 1);
  });
});

describe("AbschnittsNavigation: zwei Fassungen, die Vorgabe bleibt die Fläche", () => {
  it("`variante` ist `flaeche` oder `balken`, Vorgabe `flaeche`; der Balken kommt aus `AbschnittsBalken`", () => {
    assert.match(navigation, /variante = "flaeche"/);
    assert.match(navigation, /variante\?: "flaeche" \| "balken"/);
    assert.match(navigation, /if \(variante === "balken"\) return <AbschnittsBalken items=\{items\} label=\{label\} className=\{className\} \/>/);
  });

  it("die Fläche ist unverändert (Akzent-Soft-Fläche, Pfeil-Knöpfe, `data-abschnitts-navigation`)", () => {
    assert.match(navigation, /data-abschnitts-navigation/);
    assert.match(navigation, /bg-accent-soft/);
    assert.match(navigation, /M8 3v10m0 0-4-4m4 4 4-4/);
  });

  it("noch keine Seite ist umgestellt (das entscheidet Konrad, K-95)", () => {
    const treffer: string[] = [];
    const lauf = (ordner: string) => {
      for (const name of readdirSync(ordner)) {
        const pfad = join(ordner, name);
        if (statSync(pfad).isDirectory()) lauf(pfad);
        else if (/\.tsx$/.test(name) && /variante="balken"/.test(ohneKommentare(src(pfad)))) treffer.push(pfad);
      }
    };
    lauf("app");
    assert.deepEqual(treffer, [], "eine Seite benutzt den Balken schon");
  });
});

describe("AbschnittsBalken: die Gestalt", () => {
  it("ein Client-Baustein; die Übersicht bleibt auffindbar (`data-abschnitts-navigation`, die Seitenleiste liest sie noch), dazu `data-abschnitts-balken`", () => {
    assert.match(src("components/ui/AbschnittsBalken.tsx"), /^"use client";/);
    assert.match(balken, /data-abschnitts-navigation data-abschnitts-balken aria-label=\{label\}/);
  });

  it("der Balken klebt oben und liegt auf dem Seitengrund (deckend, kein Weichzeichner)", () => {
    assert.match(balken, /sticky top-0 z-20 mb-8 border-b bg-canvas/);
    assert.doesNotMatch(balken, /backdrop-blur|bg-canvas\//, "Glas und Durchsicht stehen auf der Verbotsliste");
  });

  it("Text mit Unterstrich, nicht Chips: der Abschnitt im Bild trägt `aria-current=\"location\"` und `border-accent`", () => {
    assert.match(balken, /aria-current=\{i === aktiv \? "location" : undefined\}/);
    assert.match(balken, /i === aktiv \? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"/);
    assert.doesNotMatch(balken, /ChipLink|bg-accent-soft/, "Chip-Form gehört den Reitern");
  });

  it("Touch-Ziel 44 px, kein Umbruch, am Handy waagerecht scrollbar ohne Scrollbalken", () => {
    assert.match(balken, /min-h-11/);
    assert.match(balken, /whitespace-nowrap/);
    assert.match(balken, /overflow-x-auto/);
    assert.match(balken, /\[scrollbar-width:none\]/);
  });

  it("der Fokusring liegt innen (die scrollbare Leiste schnitte ihn sonst ab)", () => {
    assert.match(balken, /focus-visible:-outline-offset-2/);
  });

  it("der Abschnitt im Bild rutscht in die Mitte; bei `prefers-reduced-motion` ohne Animation", () => {
    assert.match(balken, /prefers-reduced-motion: reduce/);
    assert.match(balken, /behavior: ruhig \? "auto" : "smooth"/);
  });

  it("die Messung geschieht beim Scrollen, einmal je Bild, und räumt ihre Zuhörer ab", () => {
    assert.match(balken, /requestAnimationFrame\(pruefen\)/);
    assert.match(balken, /addEventListener\("scroll", melden, \{ passive: true \}\)/);
    assert.match(balken, /removeEventListener\("scroll", melden\)/);
    assert.match(balken, /window\.innerHeight \+ window\.scrollY >= document\.documentElement\.scrollHeight - 2/, "am Seitenende gilt der letzte");
  });

  it("ein Klick gilt: der angeklickte Abschnitt bleibt aktiv, bis die Person selbst scrollt (Rad, Berührung, Taste) oder 1,5 s um sind", () => {
    assert.match(balken, /gesperrtBis\.current = performance\.now\(\) \+ 1500;\s*setAktiv\(i\);/);
    assert.match(balken, /if \(performance\.now\(\) < gesperrtBis\.current\) return;/);
    assert.match(balken, /for \(const ereignis of \["wheel", "touchmove", "keydown"\]\) window\.addEventListener\(ereignis, selbst, \{ passive: true \}\)/);
    assert.match(balken, /for \(const ereignis of \["wheel", "touchmove", "keydown"\]\) window\.removeEventListener\(ereignis, selbst\)/);
  });

  it("`Abschnitt` kommt nur als Typ aus `Abschnitte` (kein Kreis zur Laufzeit)", () => {
    assert.match(balken, /import type \{ Abschnitt \} from "@\/components\/ui\/Abschnitte"/);
  });
});

describe("Sprungziele bleiben unter dem Balken", () => {
  it("`Sektion`, `Block` und `Card` mit `id` tragen `scroll-mt-20` (80 px): mehr als der Balken (45 px) braucht", () => {
    assert.match(navigation, /<section id=\{id\} className=\{cn\("scroll-mt-20", className\)\}>/);
    assert.match(ohneKommentare(src("components/ui/Block.tsx")), /"group scroll-mt-20"/);
    assert.match(ohneKommentare(src("components/ui/Card.tsx")), /id && "scroll-mt-20"/);
  });

  it("keine zweite Regel an `html` (`scroll-padding-top`): sie verdoppelte den Abstand (gemessen 152 statt 80 px) — der Abschnitt lag zu tief und galt nicht als erreicht", () => {
    assert.doesNotMatch(css, /scroll-padding-top/);
  });

  it("die Linie, ab der ein Abschnitt als erreicht gilt, liegt knapp unter dem Landepunkt des Sprungs (80 px): 80 bis 100 px", () => {
    const linie = Number(/const LINIE = (\d+);/.exec(src("components/ui/AbschnittsBalken.tsx"))?.[1]);
    assert.ok(linie >= 80 && linie <= 100, `LINIE ${linie} px`);
  });
});

describe("Kontrast (Tokens aus globals.css)", () => {
  const token = (name: string) => new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\b`).exec(css)?.[1].toLowerCase() ?? "";
  const leuchte = (farbe: string) => {
    const [r, g, b] = [1, 3, 5]
      .map((i) => parseInt(farbe.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const kontrast = (a: string, b: string) => {
    const [hell, dunkel] = [leuchte(a), leuchte(b)].sort((m, n) => n - m);
    return (hell + 0.05) / (dunkel + 0.05);
  };
  const grund = token("ct-canvas");

  it("Text im Bild (`ink`) und die übrigen (`muted`) auf dem Seitengrund: mindestens 4,5 : 1", () => {
    assert.ok(kontrast(token("ct-ink"), grund) >= 4.5, "ink");
    assert.ok(kontrast(token("ct-muted"), grund) >= 4.5, "muted");
  });

  it("der Unterstrich in Akzent auf dem Seitengrund: mindestens 3 : 1 (Grafik, WCAG 1.4.11)", () => {
    assert.ok(kontrast(token("ct-accent"), grund) >= 3, `Kontrast ${kontrast(token("ct-accent"), grund).toFixed(2)} : 1`);
  });
});

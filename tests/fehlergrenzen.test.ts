import { strict as assert } from "node:assert";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import de from "@/lib/i18n/de.json" with { type: "json" };
import en from "@/lib/i18n/en.json" with { type: "json" };
import {
  FEHLER_RESERVE,
  FEHLER_TEXTE,
  fehlerId,
  fehlerTexte,
  serverDigest,
  spracheImBrowser,
} from "@/components/fehler/fehler";

/**
 * QS-023: Jeder Bereich hat eine Fehlergrenze, und keine davon reicht die
 * Meldung eines Fehlers an den Bildschirm durch — nur die Fehler-ID.
 *
 * Die Grenzen sind JSX und lassen sich hier nicht rendern (der Testlader
 * entfernt nur Typen). Geprüft wird deshalb zweierlei: der einzige Weg vom
 * Fehler auf den Bildschirm (`fehlerId`) trägt nichts von der Meldung, und
 * keine Grenze nimmt einen anderen Weg.
 */

/** So sähe eine Meldung aus, die nicht in den Browser gehört. */
const GEHEIM = 'relation "zz_geheim" does not exist';

function serverFehler(digest: string): Error & { digest: string } {
  return Object.assign(new Error(GEHEIM), { digest });
}

describe("Fehler-ID statt Meldung", () => {
  it("ein Server-Fehler zeigt seinen Digest und nichts von der Meldung", () => {
    const id = fehlerId(serverFehler("1784632415"));
    assert.equal(id, "1784632415");
    assert.ok(!id.includes("zz_geheim"));
  });

  it("ein Browser-Fehler bekommt eine eigene ID, je Fehler dieselbe", () => {
    const fehler = new Error(GEHEIM);
    const id = fehlerId(fehler);
    assert.match(id, /^B-[0-9A-F]{8}$/);
    assert.equal(fehlerId(fehler), id, "React rendert die Grenze mehrfach");
    assert.notEqual(fehlerId(new Error(GEHEIM)), id, "ein anderer Fehler, eine andere ID");
  });

  it("geworfene Werte, die keine Fehler sind, zeigen sich auch nicht", () => {
    assert.match(fehlerId(GEHEIM), /^B-[0-9A-F]{8}$/);
    assert.equal(fehlerId(GEHEIM), fehlerId(GEHEIM));
    assert.match(fehlerId(null), /^B-[0-9A-F]{8}$/);
    assert.match(fehlerId({ message: GEHEIM }), /^B-[0-9A-F]{8}$/);
  });

  it("ein Digest, der mehr als eine Prüfsumme trägt, wird nicht gezeigt", () => {
    // Eine Weiterleitung trägt Ziel und Status im Digest — die fängt Next
    // vor der Grenze ab; falls doch etwas durchkäme, steht dort keine Adresse.
    assert.equal(serverDigest(serverFehler("NEXT_REDIRECT;replace;/admin;307;")), null);
    assert.equal(serverDigest(serverFehler(GEHEIM)), null);
    assert.equal(serverDigest(serverFehler("x".repeat(65))), null);
    assert.equal(serverDigest({ digest: 42 }), null);
    assert.match(fehlerId(serverFehler(GEHEIM)), /^B-[0-9A-F]{8}$/);
  });
});

function tsxDateien(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return tsxDateien(p);
    return e.name.endsWith(".tsx") ? [p] : [];
  });
}

/** Alle Bereiche mit eigenem Layout: `app/(partner)/layout.tsx` usw. */
const BEREICHE = readdirSync("app", { withFileTypes: true })
  .filter((e) => e.isDirectory() && /^\(.+\)$/.test(e.name) && existsSync(join("app", e.name, "layout.tsx")))
  .map((e) => e.name);

const GRENZEN = [
  join("app", "error.tsx"),
  join("app", "global-error.tsx"),
  ...BEREICHE.map((b) => join("app", b, "error.tsx")),
];

describe("eine Fehlergrenze je Bereich", () => {
  it("es gibt die Bereiche, die das Repo kennt", () => {
    assert.ok(BEREICHE.length >= 8, `nur ${BEREICHE.join(", ")}`);
  });

  it("Wurzel, global-error und jeder Bereich haben eine error.tsx", () => {
    const fehlen = GRENZEN.filter((p) => !existsSync(p));
    assert.deepEqual(fehlen, []);
  });

  it("jede Grenze ist eine Client-Komponente und nimmt die gemeinsame Grenze", () => {
    for (const p of GRENZEN) {
      const text = readFileSync(p, "utf8");
      assert.ok(text.startsWith('"use client";'), `${p}: Fehlergrenzen sind Client-Komponenten`);
      assert.match(text, /<Fehlergrenze\b/, `${p}: bitte <Fehlergrenze …/> statt eigener Anzeige`);
    }
  });

  it("der Weg zurück führt dorthin, wohin auch das Logo des Bereichs führt", () => {
    for (const b of BEREICHE) {
      const layout = readFileSync(join("app", b, "layout.tsx"), "utf8");
      const grenze = readFileSync(join("app", b, "error.tsx"), "utf8");
      const ziel = /startHref="([^"]+)"/.exec(grenze)?.[1];
      const root = /rootHref="([^"]+)"/.exec(layout)?.[1];
      // Der Einlass hat kein Gerüst und damit kein Logo; sein Ziel ist der Scanner.
      assert.equal(ziel, root ?? `/${b.slice(1, -1)}`, `${b}: startHref`);
    }
  });
});

describe("keine Grenze zeigt die Meldung", () => {
  // Was eine Meldung oder den Stacktrace auf die Seite brächte.
  const VERBOTEN: [RegExp, string][] = [
    [/\berror\s*(\?\.|\.)\s*(message|stack|cause|name)\b/, "error.message/stack/cause/name"],
    [/\bString\(\s*error\s*\)/, "String(error)"],
    [/\$\{\s*error\s*\}/, "${error}"],
    [/JSON\.stringify\(\s*error/, "JSON.stringify(error)"],
    [/>\s*\{\s*error\s*\}\s*</, "{error} als Text"],
  ];
  const DATEIEN = [
    ...GRENZEN,
    join("components", "fehler", "Fehlergrenze.tsx"),
    join("components", "ui", "ErrorState.tsx"),
  ];

  it("weder die Grenzen noch der Baustein greifen auf die Meldung zu", () => {
    const funde = DATEIEN.flatMap((p) => {
      const text = readFileSync(p, "utf8");
      return VERBOTEN.filter(([re]) => re.test(text)).map(([, was]) => `${p}: ${was}`);
    });
    assert.deepEqual(funde, []);
  });

  it("die gemeinsame Grenze gibt den Fehler nur an fehlerId und die Konsole", () => {
    const text = readFileSync(join("components", "fehler", "Fehlergrenze.tsx"), "utf8");
    // Jede Verwendung des Bezeichners `error` außerhalb von Kommentaren.
    const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    // Die erlaubten Stellen herausnehmen; was danach noch `error` heißt, ist
    // ein Weg an fehlerId vorbei.
    const rest = code
      .replace(/^\s*error(: unknown;|,)$/gm, "") // Prop und ihr Typ
      .replace(/fehlerId\(error\)/g, "")
      .replace(/console\.error\(`Fehler-ID \$\{id\}`, error\)/g, "")
      .replace(/\[id, error\]/g, "");
    const fremd = [...rest.matchAll(/^.*\berror\b.*$/gm)].map((m) => m[0].trim());
    assert.deepEqual(fremd, [], "der Fehler darf nur in fehlerId(error) und console.error gehen");
  });

  it("keine andere Komponente baut eine eigene Fehlerseite aus error.tsx nach", () => {
    // Wer in app/ eine weitere error.tsx anlegt, nimmt die gemeinsame Grenze.
    const weitere = tsxDateien("app").filter(
      (p) => /(^|\/)(error|global-error)\.tsx$/.test(p) && !GRENZEN.includes(p),
    );
    for (const p of weitere) {
      assert.match(readFileSync(p, "utf8"), /<Fehlergrenze\b/, `${p}: bitte <Fehlergrenze …/>`);
    }
  });
});

describe("Texte der Grenze", () => {
  it("die Reserve für global-error ist dieselbe wie im Wörterbuch", () => {
    assert.deepEqual(FEHLER_RESERVE.de, fehlerTexte(de.errors));
    assert.deepEqual(FEHLER_RESERVE.en, fehlerTexte(en.errors));
  });

  it("jeder Text steht in beiden Sprachen, der Text nennt das Postfach", () => {
    for (const k of FEHLER_TEXTE) {
      assert.ok((de.errors as Record<string, string>)[k], `de: errors.${k}`);
      assert.ok((en.errors as Record<string, string>)[k], `en: errors.${k}`);
    }
    assert.match(de.errors.boundaryBody, /\{mailbox\}/);
    assert.match(en.errors.boundaryBody, /\{mailbox\}/);
  });

  it("der Auszug trägt nur die Texte der Grenze", () => {
    assert.deepEqual(Object.keys(fehlerTexte(de.errors)).sort(), [...FEHLER_TEXTE].sort());
  });
});

describe("Sprache ohne Server (global-error)", () => {
  it("die Wahl aus dem Umschalter gewinnt", () => {
    assert.equal(spracheImBrowser("a=1; ct_locale=en; b=2", ["de-DE"]), "en");
    assert.equal(spracheImBrowser("ct_locale=de", ["en-US"]), "de");
  });

  it("ohne Wahl entscheidet der Browser, sonst Deutsch", () => {
    assert.equal(spracheImBrowser("", ["fr-FR", "en-GB", "de"]), "en");
    assert.equal(spracheImBrowser("ct_locale=fr", ["de-AT"]), "de");
    assert.equal(spracheImBrowser("", ["fr"]), "de");
    assert.equal(spracheImBrowser("", []), "de");
  });
});

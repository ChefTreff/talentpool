import { strict as assert } from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { NEUES_FENSTER_ID, neuesFenster } from "@/components/ui/neues-fenster";

/**
 * QS-034: Jeder Link, der ein neues Fenster öffnet, trägt `neuesFenster` —
 * neues Fenster, `rel="noopener noreferrer"` und die Ansage für
 * Vorlesesoftware. Diese Prüfung lässt neue Links auffallen, die das
 * vergessen. Sie liest den Quelltext, kein Rendering: ein Link, dessen Ziel
 * erst zur Laufzeit feststeht, wird an seinem Namen erkannt (`…Url`, `…_url`).
 */

const WURZELN = ["app", "components"];
const HELFER = join("components", "ui", "neues-fenster.ts");

function dateien(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return dateien(p);
    return /\.(tsx|ts)$/.test(e.name) ? [p] : [];
  });
}

const QUELLEN = WURZELN.flatMap(dateien).map((pfad) => ({ pfad, text: readFileSync(pfad, "utf8") }));

type Element = { pfad: string; zeile: number; tag: string; attrs: string };

/**
 * Öffnende Tags von `<a>`, `<Link>` und `<ButtonLink>` samt Attributen —
 * mit Klammertiefe, damit ein `>` in `{a > b}` das Tag nicht vorzeitig beendet.
 */
function linkElemente(pfad: string, text: string): Element[] {
  const out: Element[] = [];
  const start = /<(a|Link|ButtonLink)(?=[\s>])/g;
  let m: RegExpExecArray | null;
  while ((m = start.exec(text))) {
    let tiefe = 0;
    let quote: string | null = null;
    let i = m.index + m[0].length;
    for (; i < text.length; i++) {
      const c = text[i];
      if (quote) {
        if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") tiefe++;
      else if (c === "}") tiefe--;
      else if (c === ">" && tiefe === 0) break;
    }
    out.push({
      pfad,
      zeile: text.slice(0, m.index).split("\n").length,
      tag: m[1],
      attrs: text.slice(m.index + m[0].length, i),
    });
  }
  return out;
}

const ELEMENTE = QUELLEN.filter((q) => q.pfad.endsWith(".tsx")).flatMap((q) => linkElemente(q.pfad, q.text));
const hatHelfer = (attrs: string) => /\{\.\.\.(\([^)]*)?neuesFenster/.test(attrs);
const ort = (e: Element) => `${e.pfad}:${e.zeile}`;

describe("Links in ein neues Fenster (QS-034)", () => {
  it("der Helfer setzt neues Fenster, rel und die Ansage", () => {
    assert.equal(neuesFenster.target, "_blank");
    assert.match(neuesFenster.rel, /\bnoopener\b/);
    assert.match(neuesFenster.rel, /\bnoreferrer\b/);
    assert.equal(neuesFenster["aria-describedby"], NEUES_FENSTER_ID);
  });

  it("das Root-Layout trägt die Ansage, auf die jeder Link verweist", () => {
    const layout = readFileSync(join("app", "layout.tsx"), "utf8");
    assert.match(layout, /id=\{NEUES_FENSTER_ID\}/);
    assert.match(layout, /t\.common\.newTab/);
  });

  it("kein Link setzt target=_blank von Hand", () => {
    const funde = QUELLEN.filter((q) => q.pfad !== HELFER).flatMap((q) =>
      [...q.text.matchAll(/target(=|:\s*)["']_blank["']/g)].map(
        (m) => `${q.pfad}:${q.text.slice(0, m.index).split("\n").length}`,
      ),
    );
    assert.deepEqual(funde, [], "statt target=\"_blank\" bitte {...neuesFenster} aus components/ui/neues-fenster.ts");
  });

  it("jeder Link auf eine feste Adresse ausserhalb öffnet ein neues Fenster", () => {
    const funde = ELEMENTE.filter((e) => /href=["']https?:\/\//.test(e.attrs) && !hatHelfer(e.attrs)).map(ort);
    assert.deepEqual(funde, []);
  });

  it("jeder Link auf eine Adresse aus Daten (…Url, …_url) öffnet ein neues Fenster oder lädt herunter", () => {
    const funde = ELEMENTE.filter((e) => {
      const href = /href=\{([^}]*)\}/.exec(e.attrs)?.[1] ?? "";
      if (!/url\b/i.test(href) && !/_url\b|Url\b|URL\b/.test(href)) return false;
      return !hatHelfer(e.attrs) && !/\bdownload\b/.test(e.attrs);
    }).map(ort);
    assert.deepEqual(funde, []);
  });

  it("window.open übergibt noopener", () => {
    const funde = QUELLEN.flatMap((q) =>
      [...q.text.matchAll(/window\.open\(([^)]*)\)/g)]
        .filter((m) => !/noopener/.test(m[1]))
        .map((m) => `${q.pfad}:${q.text.slice(0, m.index).split("\n").length}`),
    );
    assert.deepEqual(funde, []);
  });
});

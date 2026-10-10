import { strict as assert } from "node:assert";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import * as instanz from "@/lib/partner/instanz";

/**
 * QS-079, Skill „Mehrere Instanzen“ (Regel 3 und 12 in `SKILL.md`, `referenzen/muster.md` → „Mehrere Instanzen“): wer eine Mehrfach-Seite baut, liest dort,
 * was es gibt. Der Text nennt den Umschalter und seine Regeln beim Namen — fehlt einer im Code, baut der Nächste ihn noch einmal. Stand 10.10.2026 sagte der
 * Text noch, der Baustein entstehe erst nach dem dritten Einsatz, dabei lag `InstanzWahl` seit #457 da und drei Seiten nutzten ihn.
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const ohneKommentare = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const skill = quelle(".claude/skills/portal-design/SKILL.md");
const muster = quelle(".claude/skills/portal-design/referenzen/muster.md");
/** Der Abschnitt „Mehrere Instanzen“ samt „Wo das Muster gilt“, bis zum nächsten Muster. */
const abschnitt = muster.slice(muster.indexOf("## Mehrere Instanzen"), muster.indexOf("## Liste mit Zeilenaktion"));

/** Alle Quelltexte unter einem Ordner, ohne Kommentare — die Seiten und Bausteine, die einen Umschalter zeichnen könnten. */
function quelltexte(ordner: string): { datei: string; text: string }[] {
  const wurzel = new URL(`../${ordner}/`, import.meta.url);
  const treffer: { datei: string; text: string }[] = [];
  const gehe = (pfad: string) => {
    for (const name of readdirSync(new URL(pfad, wurzel))) {
      const rel = `${pfad}${name}`;
      if (statSync(new URL(rel, wurzel)).isDirectory()) gehe(`${rel}/`);
      else if (/\.(ts|tsx)$/.test(name)) treffer.push({ datei: `${ordner}/${rel}`, text: ohneKommentare(readFileSync(new URL(rel, wurzel), "utf8")) });
    }
  };
  gehe("");
  return treffer;
}

/** Was der Text über die Regeln in `lib/partner/instanz.ts` sagt. */
const GENANNT = [
  "INSTANZ_PARAM",
  "instanzKennung",
  "waehleInstanz",
  "instanzTitel",
  "instanzLeiste",
  "instanzHref",
  "instanzSuffix",
  "kurzSlot",
  "vorgabeMasterclass",
  "vorgabeTisch",
  "vorgabeStopp",
  "tischWahl",
  "stoppWahl",
] as const;

describe("Skill „Mehrere Instanzen“: was er nennt, gibt es", () => {
  it("jeder genannte Name steht im Abschnitt und wird aus `lib/partner/instanz.ts` ausgeführt", () => {
    assert.ok(abschnitt.length > 500, "Der Abschnitt „Mehrere Instanzen“ fehlt in muster.md");
    for (const name of GENANNT) {
      assert.ok(abschnitt.includes(name), `muster.md nennt ${name} nicht mehr`);
      assert.ok(name in instanz, `${name} steht im Skill, aber nicht in lib/partner/instanz.ts`);
    }
  });

  it("`InstanzWahl` liegt in `components/layout`, ist eine Hülle um `SectionTabs`, und Regel 3 und 12 nennen sie", () => {
    assert.ok(existsSync(new URL("../components/layout/InstanzWahl.tsx", import.meta.url)), "components/layout/InstanzWahl.tsx fehlt");
    const baustein = ohneKommentare(quelle("components/layout/InstanzWahl.tsx"));
    assert.match(baustein, /export function InstanzWahl\(/);
    assert.match(baustein, /<SectionTabs/);
    const regel3 = /\n3\. \*\*Nichts nachbauen, was es gibt\.\*\*[^\n]*/.exec(skill)?.[0] ?? "";
    const regel12 = /\n12\. \*\*Mehrere Instanzen[^\n]*/.exec(skill)?.[0] ?? "";
    assert.match(regel3, /`InstanzWahl` \(`components\/layout`/);
    assert.match(regel12, /Baustein: `InstanzWahl` \(`components\/layout`\)/);
    assert.match(regel12, /`lib\/partner\/instanz\.ts`/);
  });

  it("der Text behauptet nicht mehr, der Baustein entstehe erst später", () => {
    assert.doesNotMatch(abschnitt, /entsteht erst|den Baustein gibt es mit dem dritten Einsatz/);
    assert.doesNotMatch(skill, /entsteht erst/);
  });

  it("die Tabelle „Wo das Muster gilt“ trägt die gemergten Einsätze mit ihrer PR-Nummer", () => {
    const tabelle = abschnitt.slice(abschnitt.indexOf("### Wo das Muster gilt"));
    for (const [seite, pr] of [
      ["/partner/masterclass", "#453"],
      ["/partner/interview-tables", "#457"],
      ["/partner/company-tour", "#463"],
    ]) {
      const zeile = tabelle.split("\n").find((z) => z.startsWith(`| \`${seite}\``)) ?? "";
      assert.ok(zeile, `${seite} fehlt in der Tabelle`);
      assert.ok(zeile.includes(`**gebaut ${pr}**`), `${seite}: „gebaut ${pr}“ fehlt`);
    }
  });
});

describe("die drei Einsätze zeichnen den Umschalter mit `InstanzWahl` und bauen keine Adresse von Hand", () => {
  for (const datei of [
    "app/(partner)/partner/masterclass/MasterclassKopf.tsx",
    "app/(partner)/partner/company-tour/TourKopf.tsx",
    "app/(partner)/partner/interview-tables/page.tsx",
    "app/(partner)/partner/FormatUnterseite.tsx",
  ]) {
    it(`${datei}: <InstanzWahl leiste=…>`, () => {
      assert.match(ohneKommentare(quelle(datei)), /<InstanzWahl leiste=\{instanzen\} label=\{[^}]+\} \/>/);
    });
  }

  it("keine Seite und kein Baustein setzt `?instanz=` selbst zusammen — die Adresse kommt aus `instanzHref` und `instanzSuffix`", () => {
    for (const ordner of ["app", "components"]) {
      for (const { datei, text } of quelltexte(ordner)) {
        assert.doesNotMatch(text, /\?instanz=/, `${datei} baut ?instanz= von Hand: instanzHref/instanzSuffix aus lib/partner/instanz.ts nehmen (Skill, Regel 12)`);
      }
    }
  });
});

import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * LEAD-056 (Feedbackrunde Konrad und Paulina 05.10.2026; Konrad: „Programmbord muss auf jeden Fall unter bestätigte Speaker, und im besten Fall hat man dann eine
 * Hospitality-Seite mit Unterseiten An- und Abreise und Shuttle“): die Seitenleiste der Stage Leads. Das **Programm-Board steht direkt unter „Bestätigte Speaker“**;
 * **Hospitality** ist ein Gruppenkopf mit den beiden Seiten „An- & Abreise“ und „Shuttle“, zuletzt. Keine Seite zieht um: alle Adressen bleiben, nur Reihenfolge und Gruppe
 * ändern sich. Das Layout ist eine Server-Komponente ohne DOM-Testlauf — der Test liest die Liste aus dem Quelltext (wie `qs-076-home.test.ts`, das dieselbe Datei prüft).
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const LAYOUT = "app/(speaker-leads)/layout.tsx";
const ohneKommentare = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

type Punkt = { href: string; label: string };
type Gruppe = { kopf: string; punkte: Punkt[] };

/** Die Gruppen aus `groups={[ … ]}` in der Reihenfolge des Quelltextes: Kopf (`""` oder `t.leads.<schlüssel>`) und Punkte (`href`, `t.leads.<schlüssel>`). */
function gruppen(): Gruppe[] {
  const q = ohneKommentare(quelle(LAYOUT));
  const von = q.indexOf("groups={[");
  const bis = q.indexOf("]}\n    >", von);
  assert.ok(von > 0 && bis > von, "groups={[ … ]} nicht gefunden");
  const text = q.slice(von, bis);
  const treffer = [...text.matchAll(/label: (""|t\.leads\.([A-Za-z]+)),\s*items: \[([\s\S]*?)\],\s*\}/g)];
  return treffer.map((m) => ({
    kopf: m[1] === '""' ? "" : (m[2] as string),
    punkte: [...(m[3] as string).matchAll(/\{ href: "([^"]+)", label: t\.leads\.([A-Za-z]+) \}/g)].map((p) => ({ href: p[1] as string, label: p[2] as string })),
  }));
}

describe("LEAD-056: die Seitenleiste der Stage Leads", () => {
  it("zwei Gruppen: die erste ohne Kopf, die zweite „Hospitality“ — und Hospitality steht zuletzt", () => {
    const g = gruppen();
    assert.deepEqual(g.map((x) => x.kopf), ["", "navHospitality"]);
  });

  it("das Programm-Board steht direkt unter „Bestätigte Speaker“ (davor Home und Pipeline, danach Regie, Präsentationen, Einreichungen)", () => {
    const erste = gruppen()[0].punkte;
    assert.deepEqual(
      erste.map((p) => p.href),
      [
        "/speaker-leads",
        "/speaker-leads/pipeline",
        "/speaker-leads/bestaetigt",
        "/speaker-leads/board",
        "/speaker-leads/regie",
        "/speaker-leads/praesentationen",
        "/speaker-leads/einreichungen",
      ],
    );
    const i = erste.findIndex((p) => p.href === "/speaker-leads/bestaetigt");
    assert.equal(erste[i + 1].href, "/speaker-leads/board");
    assert.equal(erste[i + 1].label, "navBoard");
  });

  it("Hospitality trägt genau die beiden Seiten An- & Abreise und Shuttle, in dieser Reihenfolge", () => {
    assert.deepEqual(gruppen()[1].punkte, [
      { href: "/speaker-leads/anreise", label: "navTravel" },
      { href: "/speaker-leads/shuttle", label: "navShuttle" },
    ]);
  });

  it("nichts ging verloren und nichts steht doppelt: alle neun Seiten genau einmal, jede Adresse hat ihre Seite", () => {
    const alle = gruppen().flatMap((x) => x.punkte.map((p) => p.href));
    assert.equal(alle.length, 9);
    assert.equal(new Set(alle).size, 9);
    for (const href of alle) {
      const pfad = href === "/speaker-leads" ? "page.tsx" : `${href.slice("/speaker-leads/".length)}/page.tsx`;
      assert.ok(existsSync(new URL(`../app/(speaker-leads)/speaker-leads/${pfad}`, import.meta.url)), `${href}: ${pfad} fehlt`);
    }
  });

  it("Home bleibt der erste Punkt (QS-076) und der Einstieg des Bereichs", () => {
    assert.equal(gruppen()[0].punkte[0].label, "navOverview");
    assert.match(quelle(LAYOUT), /rootHref="\/speaker-leads"/);
  });
});

describe("LEAD-056: Texte DE und EN", () => {
  type Woerterbuch = { leads: Record<string, string> };
  const de = JSON.parse(quelle("lib/i18n/de.json")) as Woerterbuch;
  const en = JSON.parse(quelle("lib/i18n/en.json")) as Woerterbuch;

  it("der Gruppenkopf heißt in beiden Sprachen „Hospitality“; jeder Punkt des Menüs hat einen Text", () => {
    assert.equal(de.leads.navHospitality, "Hospitality");
    assert.equal(en.leads.navHospitality, "Hospitality");
    for (const g of gruppen()) {
      for (const p of g.punkte) {
        assert.ok(de.leads[p.label]?.trim(), `de ${p.label}`);
        assert.ok(en.leads[p.label]?.trim(), `en ${p.label}`);
      }
    }
  });

  it("die Namen der beiden Unterseiten bleiben „An- & Abreise“ und „Shuttle“", () => {
    assert.equal(de.leads.navTravel, "An- & Abreise");
    assert.equal(de.leads.navShuttle, "Shuttle");
    assert.equal(en.leads.navTravel, "Arrival & departure");
  });
});

describe("LEAD-056: Doku", () => {
  it("Testleitfaden: die Zeile „Seitenleiste (LEAD-056)“ nennt die Reihenfolge und die Gruppe", () => {
    const zeile = quelle("docs/team-testleitfaden.md")
      .split("\n")
      .find((l) => l.startsWith("| Seitenleiste (LEAD-056) |"));
    assert.ok(zeile, "Zeile fehlt");
    assert.match(zeile, /\*\*Programm-Board direkt darunter\*\*/);
    assert.match(zeile, /Gruppe \*\*Hospitality\*\* mit den beiden Unterseiten \*\*An- & Abreise\*\* und \*\*Shuttle\*\*/);
  });

  it("Backlog: LEAD-056 trägt die PR-Nummer, nennt die Entscheidung „nur das Menü“ und „keine Migration“", () => {
    const zeile = quelle("docs/feedback/speaker-leads.md")
      .split("\n")
      .find((l) => l.startsWith("| LEAD-056 |"));
    assert.ok(zeile && /\| P2 \| (geplant|gebaut|abgenommen) #\d+/.test(zeile), "LEAD-056 trägt keine PR-Nummer");
    assert.match(zeile, /keine Migration/);
    assert.match(zeile, /Bewusst nur das Menü/);
    assert.match(zeile, /Admin-Weg: keine Admin-Funktion/);
  });
});

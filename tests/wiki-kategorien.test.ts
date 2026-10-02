import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";
import {
  SLUGS_JE_KATEGORIE,
  WIKI_KATEGORIEN,
  gruppiereNachKategorie,
  wikiKategorie,
} from "@/lib/wiki/kategorien";

/**
 * PART-058: Die Wiki-Liste ist nach Themen gruppiert, nicht nach Phase. Bis der
 * Artikel ein Feld `category` hat, steht die Zuordnung im Code (Slug → Thema).
 */

const artikel = (slug: string, title = slug, category?: string | null) => ({ slug, title, category });

/** Die Slugs der importierten Artikel — aus dem Front Matter, nicht aus dem Dateinamen. */
function importierteSlugs(): string[] {
  return readdirSync("content/wiki")
    .filter((f) => f.endsWith(".md"))
    .map((f) => /^slug:\s*(.+)$/m.exec(readFileSync(`content/wiki/${f}`, "utf8"))?.[1].trim() ?? "");
}

describe("Zuordnung Slug → Thema", () => {
  it("führt keinen Artikel in zwei Themen", () => {
    const alle = WIKI_KATEGORIEN.flatMap((k) => [...SLUGS_JE_KATEGORIE[k]]);
    assert.equal(new Set(alle).size, alle.length);
  });

  it("verweist nur auf Artikel, die es gibt — eine umbenannte Datei fällt auf", () => {
    const vorhanden = new Set(importierteSlugs());
    const fehlend = WIKI_KATEGORIEN.flatMap((k) => SLUGS_JE_KATEGORIE[k]).filter((s) => !vorhanden.has(s));
    assert.deepEqual(fehlend, []);
  });
});

describe("wikiKategorie", () => {
  it("nimmt die Zuordnung nach Slug", () => {
    assert.equal(wikiKategorie(artikel("messestand-rueckwand")), "stand");
    assert.equal(wikiKategorie(artikel("talk-guidelines")), "speaking");
  });

  it("lässt ein ausdrücklich gesetztes Thema am Artikel gewinnen", () => {
    assert.equal(wikiKategorie(artikel("messestand-rueckwand", "x", "vorort")), "vorort");
  });

  it("ignoriert ein unbekanntes Thema und fällt auf Slug, dann auf „weitere“ zurück", () => {
    assert.equal(wikiKategorie(artikel("messestand-rueckwand", "x", "gibt-es-nicht")), "stand");
    assert.equal(wikiKategorie(artikel("neuer-artikel", "x", "gibt-es-nicht")), "weitere");
    assert.equal(wikiKategorie(artikel("neuer-artikel", "x", null)), "weitere");
    assert.equal(wikiKategorie(artikel("neuer-artikel")), "weitere");
  });
});

describe("gruppiereNachKategorie", () => {
  it("ordnet die Gruppen fest, „weitere“ zuletzt, und lässt leere weg", () => {
    const g = gruppiereNachKategorie([
      artikel("neuer-artikel", "Neu"),
      artikel("pfand"),
      artikel("speaker-briefing"),
      artikel("ueber-cheftreff"),
    ]);
    assert.deepEqual(
      g.map((x) => x.kategorie),
      ["summit", "vorort", "speaking", "weitere"],
    );
  });

  it("sortiert in einer Gruppe nach der Reihenfolge der Zuordnung, nicht nach Titel", () => {
    const g = gruppiereNachKategorie([
      artikel("anlieferung-lkw", "Anlieferung (LKW)"),
      artikel("hallenplan-standuebersicht", "Hallenplan"),
      artikel("messestand-rueckwand", "Rückwand"),
    ]);
    assert.deepEqual(
      g[0].artikel.map((a) => a.slug),
      ["hallenplan-standuebersicht", "messestand-rueckwand", "anlieferung-lkw"],
    );
  });

  it("stellt nicht eingeordnete Artikel einer Gruppe hinten an, alphabetisch", () => {
    const g = gruppiereNachKategorie([
      artikel("zebra", "Zebra", "stand"),
      artikel("alpha", "Älter", "stand"),
      artikel("messeshop", "Messeshop"),
    ]);
    assert.deepEqual(
      g[0].artikel.map((a) => a.slug),
      ["messeshop", "alpha", "zebra"],
    );
  });

  it("verliert und verdoppelt keinen Artikel", () => {
    const eingabe = importierteSlugs().map((s) => artikel(s));
    const ausgabe = gruppiereNachKategorie(eingabe).flatMap((x) => x.artikel.map((a) => a.slug));
    assert.deepEqual([...ausgabe].sort(), eingabe.map((a) => a.slug).sort());
  });

  it("ist bei leerer Liste leer", () => {
    assert.deepEqual(gruppiereNachKategorie([]), []);
  });
});

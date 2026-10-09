import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { gruppiereBegriffe, passtBegriff } from "@/lib/vokabular/suche";

const lies = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const b = (vocabulary: string, key: string, label_de: string, label_en: string) => ({ vocabulary, key, label_de, label_en });
const liste = [
  b("occupation_status", "student", "Studierende", "Student"),
  b("occupation_status", "employee", "Angestellte", "Employee"),
  b("gender", "weiblich", "Weiblich", "Female"),
  b("consent_type", "newsletter", "Newsletter", "Newsletter"),
];

describe("Vokabular: Suche und Zeilen (ADM-101)", () => {
  it("jedes Wort muss in Schlüssel, Beschriftung oder Vokabularname vorkommen", () => {
    assert.equal(passtBegriff(liste[0], ""), true);
    assert.equal(passtBegriff(liste[0], "studier"), true, "deutsche Beschriftung");
    assert.equal(passtBegriff(liste[0], "STUDENT"), true, "Schlüssel und Englisch, Großschreibung egal");
    assert.equal(passtBegriff(liste[0], "occupation"), true, "Name des Vokabulars");
    assert.equal(passtBegriff(liste[0], "occupation student"), true);
    assert.equal(passtBegriff(liste[0], "occupation angestellte"), false, "beide Wörter müssen im selben Begriff stehen");
  });

  it("gruppiert alphabetisch nach Vokabular, wendet Filter und Suche an und zählt die Treffer", () => {
    const alle = gruppiereBegriffe(liste, { vokabular: "", q: "" });
    assert.deepEqual(alle.namen, ["consent_type", "gender", "occupation_status"]);
    assert.equal(alle.treffer, 4);
    const nurStatus = gruppiereBegriffe(liste, { vokabular: "occupation_status", q: "" });
    assert.deepEqual(nurStatus.namen, ["occupation_status"]);
    assert.equal(nurStatus.treffer, 2);
    const suche = gruppiereBegriffe(liste, { vokabular: "", q: "female" });
    assert.deepEqual(suche.namen, ["gender"]);
    const nichts = gruppiereBegriffe(liste, { vokabular: "gender", q: "newsletter" });
    assert.deepEqual(nichts.namen, []);
    assert.equal(nichts.treffer, 0);
  });

  it("die Ansicht hat eine Zeile je Begriff: ein Knopf, der Rest im Menü; Suche und Filter in der Adresszeile", () => {
    const v = lies("app/(admin)/admin/vokabular/VokabularView.tsx");
    assert.match(v, /useUrlFilter\(\{ q: "", vokabular: "" \}\)/);
    assert.match(v, /gruppiereBegriffe\(terms, f\)/);
    assert.match(v, /<Menu ton="hell"/);
    // Aktivieren/Deaktivieren und Löschen liegen im Menü, nicht als eigene Knöpfe in der Zeile.
    const zeile = v.slice(v.indexOf("{gruppen[v].map((term) => ("), v.indexOf("</Tbody>"));
    assert.equal((zeile.match(/<Button/g) ?? []).length, 1, "nur „Bearbeiten“ ist ein Knopf");
    assert.match(zeile, /<MenuItem onSelect=\{\(\) => speichern/);
    assert.match(zeile, /term\.usage === 0 && term\.kinder === 0 && \(\s*<MenuItem onSelect=\{\(\) => setFrage\(term\)\}/);
    assert.ok(!/<Th>\{t\.colActions\}<\/Th>[\s\S]*<Th>/.test(v.slice(v.indexOf("<Thead>"), v.indexOf("</Thead>"))), "Aktionen ist die letzte Spalte");
  });

  it("lange Beschriftungen brechen die Zeile nicht um und stehen im Tooltip; die neuen Texte gibt es in DE und EN", () => {
    const v = lies("app/(admin)/admin/vokabular/VokabularView.tsx");
    assert.match(v, /max-w-64 truncate" title=\{term\.label_de\}/);
    assert.match(v, /max-w-64 truncate" title=\{term\.label_en\}/);
    for (const l of ["de", "en"]) {
      const d = JSON.parse(lies(`lib/i18n/${l}.json`)) as { adminVocab: Record<string, string> };
      for (const k of ["searchLabel", "searchPlaceholder", "hits", "noHits", "moreActions"]) assert.ok(d.adminVocab[k], `${l}.adminVocab.${k}`);
    }
  });
});

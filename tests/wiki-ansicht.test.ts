import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { leseAnker } from "@/components/wiki/anker";
import { abschnittsKennung, abschnitte } from "@/components/wiki/markdown-parse";

/**
 * PART-058: Das Wiki zeigt die Artikel nach Thema, am Handy Liste oder Artikel,
 * und „Auf diesem Artikel“ springt zu den Abschnitten. Die Adresse bleibt die
 * Kennung des Artikels (`#slug`), ein Abschnitt hängt dahinter.
 */

const lies = (pfad: string) => readFileSync(pfad, "utf8");

describe("leseAnker", () => {
  it("liest `#slug` — so verlinken die Quellen des Assistenten", () => {
    assert.deepEqual(leseAnker("#messestand-rueckwand"), { slug: "messestand-rueckwand", abschnitt: null });
  });

  it("liest `#slug/abschnitt`", () => {
    assert.deepEqual(leseAnker("#messestand-rueckwand/frist"), { slug: "messestand-rueckwand", abschnitt: "frist" });
  });

  it("dekodiert Prozentzeichen und überlebt einen verstümmelten Anker", () => {
    assert.deepEqual(leseAnker("#a%2Fb"), { slug: "a", abschnitt: "b" });
    assert.deepEqual(leseAnker("#%zz"), { slug: "%zz", abschnitt: null });
  });

  it("gibt bei leerem Anker nichts zurück und behandelt einen Schrägstrich am Ende als ohne Abschnitt", () => {
    assert.equal(leseAnker(""), null);
    assert.equal(leseAnker("#"), null);
    assert.equal(leseAnker("#/frist"), null);
    assert.deepEqual(leseAnker("#slug/"), { slug: "slug", abschnitt: null });
  });
});

describe("Abschnitte eines Artikels", () => {
  it("macht aus Überschriften Kennungen: klein, Umlaute ausgeschrieben, Satzzeichen zu Bindestrichen", () => {
    assert.equal(abschnittsKennung("Maße für Design und Beschnitt"), "masse-fuer-design-und-beschnitt");
    assert.equal(abschnittsKennung("Bis wann und wo reiche ich die Druckdatei ein?"), "bis-wann-und-wo-reiche-ich-die-druckdatei-ein");
    assert.equal(abschnittsKennung("Hotel & Unterkunft"), "hotel-und-unterkunft");
    assert.equal(abschnittsKennung("?!"), "abschnitt");
  });

  it("liest nur die Überschriften der zweiten Ebene, in Reihenfolge", () => {
    const md = "Einleitung.\n\n## Frist\n\ntext\n\n### Unterpunkt\n\n## Wer muss **einsenden**?\n\n# Oben\n";
    assert.deepEqual(abschnitte(md), [
      { id: "frist", label: "Frist" },
      { id: "wer-muss-einsenden", label: "Wer muss einsenden?" },
    ]);
  });

  it("macht doppelte Überschriften eindeutig", () => {
    const md = "## Kosten\n\na\n\n## Kosten\n\nb\n\n## Kosten\n";
    assert.deepEqual(abschnitte(md).map((a) => a.id), ["kosten", "kosten-2", "kosten-3"]);
  });

  it("liefert für einen Artikel ohne Abschnitte nichts", () => {
    assert.deepEqual(abschnitte("Nur ein Absatz."), []);
  });

  it("Übersicht und Überschriften nehmen dieselbe Quelle — jede Kennung der Übersicht gibt es als `id` im Text", () => {
    const quelle = lies("components/wiki/Markdown.tsx");
    // `Markdown` zieht die Kennungen aus `abschnitte()`, nicht aus einer zweiten Berechnung.
    assert.match(quelle, /abschnitte\(source\)/);
    assert.match(quelle, /kennungen\.set\(i, `\$\{idPrefix\}\/\$\{liste\[n\+\+\]\.id\}`\)/);
    assert.match(quelle, /id=\{kennungen\.get\(i\)\}/);
  });
});

describe("WikiView", () => {
  const quelle = lies("components/wiki/WikiView.tsx");

  it("gruppiert die Liste nach Thema, mit Überschriften und ohne Phasenfilter", () => {
    assert.match(quelle, /gruppiereNachKategorie\(visible/);
    assert.match(quelle, /<h3 id=\{`wiki-thema-\$\{g\.kategorie\}`\}/);
    assert.doesNotMatch(quelle, /<Select\b/);
  });

  it("hält die Überschriftenfolge ein: Seitentitel, verborgene Ebene, Themen, Artikel", () => {
    // h1 = Artikeltitel (PageHeader, `titleId="wiki-titel"`; am Handy in der Liste „Wiki“) → h2 (nur für Vorlesesoftware) → h3 Themen;
    // im Artikel: h2 Abschnitte → h3 Unterabschnitte (PART-104, `Markdown`).
    assert.match(quelle, /<h2 id="wiki-liste" className="sr-only">/);
    assert.match(quelle, /titleId="wiki-titel"/);
    assert.doesNotMatch(quelle, /<h2 id="wiki-titel"/);
  });

  it("meldet die Trefferzahl als Statusmeldung", () => {
    assert.match(quelle, /<p role="status"/);
    assert.match(quelle, /t\.foundOne/);
    assert.match(quelle, /t\.foundMany\.replace\("\{n\}"/);
  });

  it("zeigt am Handy Liste ODER Artikel und führt den Fokus mit", () => {
    // Liste weg, sobald ein Artikel gewählt ist; Artikel weg, solange keiner gewählt ist.
    assert.match(quelle, /imArtikel \? "hidden" : "flex"/);
    assert.match(quelle, /imArtikel \? "block" : "hidden"/);
    assert.match(quelle, /lg:hidden/);
    assert.match(quelle, /fokusZiel\.current = "titel"/);
    assert.match(quelle, /fokusZiel\.current = "liste"/);
    // Der Titel trägt `tabIndex={-1}` im `PageHeader`, sobald er eine Referenz bekommt.
    assert.match(quelle, /titleRef=\{titelRef\}/);
    assert.match(lies("components/ui/PageHeader.tsx"), /tabIndex=\{titleRef \? -1 : undefined\}/);
  });

  it("markiert den Standardartikel nur, wo er zu sehen ist (nicht in der Handyliste)", () => {
    assert.match(quelle, /const markiert = \(id: string\) => open\?\.id === id && \(desktop \|\| imArtikel\)/);
    assert.match(quelle, /aria-current=\{markiert\(a\.id\)/);
  });

  it("ist jeder Knopf ein Knopf, kein Absenden", () => {
    const knoepfe = quelle.match(/<button\b[^>]*>/g) ?? [];
    assert.ok(knoepfe.length >= 2);
    for (const k of knoepfe) assert.match(k, /type="button"/);
  });

  it("kennzeichnet einen Artikel in anderer Sprache und bietet die Abschnittsübersicht erst ab vier Abschnitten", () => {
    assert.match(quelle, /lang=\{open && open\.language !== locale \? open\.language : undefined\}/);
    assert.match(quelle, /MIN_ABSCHNITTE = 4/);
    assert.match(quelle, /abschnittsListe\.length >= MIN_ABSCHNITTE/);
  });

  it("verwirft Phasen als Filter, zeigt die Phase aber weiter als Marke am Artikel", () => {
    assert.match(quelle, /phases\[open\.phase\]/);
    assert.doesNotMatch(quelle, /setPhase|phaseFilter/);
  });
});

describe("Wortlaut", () => {
  const schluessel = [
    "allArticles", "foundMany", "foundOne", "katHackathon", "katProgramm", "katSichtbarkeit", "katSpeaking",
    "katStand", "katSummit", "katVorort", "katWeitere", "listLabel", "moreOn", "onThisArticle", "updated",
  ];
  for (const sprache of ["de", "en"] as const) {
    const wiki = JSON.parse(lies(`lib/i18n/${sprache}.json`)).wiki as Record<string, string>;
    it(`${sprache}: alle Schlüssel der Ansicht sind da und nicht leer`, () => {
      for (const k of schluessel) assert.ok((wiki[k] ?? "").trim().length > 0, k);
    });
    it(`${sprache}: die Platzhalter stimmen`, () => {
      assert.match(wiki.foundMany, /\{n\}/);
      assert.match(wiki.moreOn, /\{topic\}/);
      assert.match(wiki.updated, /\{date\}/);
    });
  }
  it("jedes Thema der Liste hat eine Beschriftung — in beiden Sprachen", () => {
    const quelle = lies("lib/wiki/kategorien.ts");
    const verwendet = [...quelle.matchAll(/:\s*"(kat[A-Za-z]+)"/g)].map((m) => m[1]);
    assert.equal(verwendet.length, 8, "sieben Themen und „weitere“");
    for (const sprache of ["de", "en"]) {
      const wiki = JSON.parse(lies(`lib/i18n/${sprache}.json`)).wiki as Record<string, string>;
      for (const k of verwendet) assert.ok(wiki[k], `${sprache}: ${k}`);
    }
  });
});

describe("Admin → Wiki", () => {
  const admin = lies("app/(admin)/admin/wiki/WikiAdmin.tsx");

  it("zeigt das abgeleitete Thema als Spalte, mit denselben Beschriftungen wie das Portal", () => {
    assert.match(admin, /<Th>\{t\.colTopic\}<\/Th>/);
    assert.match(admin, /t\[THEMA_TEXT\[a\.thema as WikiKategorie\]\]/);
  });

  it("sagt, dass das Thema abgeleitet und noch nicht bearbeitbar ist", () => {
    assert.match(admin, /t\.topicHint/);
    for (const sprache of ["de", "en"]) {
      const wiki = JSON.parse(lies(`lib/i18n/${sprache}.json`)).wiki as Record<string, string>;
      assert.ok(wiki.colTopic && wiki.topicHint, sprache);
    }
  });
});

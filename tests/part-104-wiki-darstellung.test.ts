import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * PART-104, erster Teil (Konrad 08.10.2026, K-73): der Artikel ist die Seite — sein Titel ist der Seitentitel, seine Abschnitte
 * sind Überschriften, die man sieht (Ebenen 18/24 in Versalien mit einer Linie darüber, dann 16/24 halbfett), der gewählte
 * Artikel in der Liste trägt einen Balken. Die Gliederung im Text (die 26 fetten Zeilen) ist der zweite Teil. Es gibt keinen
 * DOM-Testlauf im Repo: Quelltext hier, Bild und Maße in der PR-Beschreibung.
 */

const src = (p: string) => readFileSync(p, "utf8");
const ohneKommentare = (q: string) => q.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const markdown = ohneKommentare(src("components/wiki/Markdown.tsx"));
const ansicht = ohneKommentare(src("components/wiki/WikiView.tsx"));
const seite = ohneKommentare(src("components/wiki/WikiPage.tsx"));
const kopf = ohneKommentare(src("components/ui/PageHeader.tsx"));
const css = src("app/globals.css");

const groesse = (rolle: string) => {
  const m = new RegExp(`\\.${rolle} \\{[^}]*?font-size:\\s*(\\d+)px`).exec(css);
  assert.ok(m, `${rolle} in globals.css`);
  return Number(m[1]);
};
const farbe = (name: string) => {
  const m = new RegExp(`--ct-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  assert.ok(m, `--ct-${name}`);
  return m[1];
};
const luminanz = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const kontrast = (a: string, b: string) => {
  const [hell, dunkel] = [luminanz(a), luminanz(b)].sort((x, y) => y - x);
  return (hell + 0.05) / (dunkel + 0.05);
};

describe("PART-104: Wiki — vier Ebenen, vier Größen (Markdown)", () => {
  it("die Größen fallen mit der Ebene: Seitentitel > Abschnitt > Unterabschnitt — aus `globals.css` gelesen", () => {
    const [h1, h2, h3] = [groesse("ct-h1"), groesse("ct-h2"), groesse("ct-h3")];
    assert.ok(h1 > h2 && h2 > h3, `${h1} > ${h2} > ${h3}`);
    // Der Abschnitt ist größer als der Fließtext (16): vorher unterschied er sich von ihm allein durch das Gewicht.
    assert.ok(h2 > 16, `ct-h2 ${h2} px > Fließtext 16 px`);
  });

  it("ein Abschnitt (`##`) ist `h2` in `ct-h2` mit der Kennung und einer Linie darüber — der erste Block der Seite ohne", () => {
    assert.match(
      markdown,
      /<h2\s+key=\{key\}\s+id=\{kennungen\.get\(i\)\}\s+className=\{cn\("ct-h2 scroll-mt-20", i > 0 && "mt-7 border-t pt-6"\)\}\s*>/,
    );
  });

  it("ein Unterabschnitt (`###`) ist `h3` in `ct-h3`, 24 px unter dem Vorigen (12 Spalt + `mt-3`)", () => {
    assert.match(markdown, /<h3 key=\{key\} className="ct-h3 mt-3">/);
  });

  it("ein `#` im Text bleibt als Absicherung ein `h2` — der eine `h1` gehört dem Titel der Seite", () => {
    assert.equal((markdown.match(/<h2 key=\{key\} className="ct-h2 mt-6">/g) ?? []).length, 2, "in beiden Fassungen");
    assert.doesNotMatch(markdown, /<h1\b/);
  });

  it("Absätze, Listen und Hinweiskästen laufen höchstens `max-w-text` breit; Tabellen nehmen ihre Breite", () => {
    assert.match(markdown, /<p key=\{key\} className=\{cn\("leading-6", !kompakt && "max-w-text"\)\}>/);
    assert.match(markdown, /<ol key=\{key\} className=\{cn\("ml-5 flex list-decimal flex-col gap-1", !kompakt && "max-w-text"\)\}>/);
    assert.match(markdown, /<ul key=\{key\} className=\{cn\("ml-5 flex list-disc flex-col gap-1", !kompakt && "max-w-text"\)\}>/);
    assert.match(markdown, /className=\{cn\("border-l-2 border-l-accent bg-accent-soft\/40 py-2 pl-4", !kompakt && "max-w-text"\)\}/);
    const von = markdown.indexOf('case "table"');
    const tabelle = markdown.slice(von, markdown.indexOf("default:", von));
    assert.ok(tabelle.length > 300, "Zweig der Tabelle gefunden");
    assert.doesNotMatch(tabelle, /max-w-text/);
  });

  it("die kompakte Fassung behält die kleine Zuordnung von früher und gehört dem Chat des Assistenten — Wiki und Editor-Vorschau nicht", () => {
    const kompakt = markdown.slice(markdown.indexOf("if (kompakt) {"), markdown.indexOf("return b.level === 1 ? (", markdown.indexOf("if (kompakt) {") + 200));
    assert.match(kompakt, /<h3 key=\{key\} id=\{kennungen\.get\(i\)\} className="ct-h3 mt-5 scroll-mt-20">/);
    assert.match(kompakt, /<h4 key=\{key\} className="ct-label mt-4">/);
    assert.match(markdown, /kompakt = false/);
    assert.match(src("components/wiki/Assistent.tsx"), /<Markdown source=\{zug\.text\} kompakt \/>/);
    assert.doesNotMatch(src("components/wiki/Editor.tsx"), /<Markdown\b[^>]*kompakt/);
    assert.doesNotMatch(src("components/wiki/WikiView.tsx"), /<Markdown\b[^>]*kompakt/);
  });
});

describe("PART-104: Wiki — der Artikel ist die Seite (WikiView, WikiPage, PageHeader)", () => {
  it("zwei Köpfe im Markup, einer ausgeblendet: „Wiki“ für die Liste am Handy, der Artikeltitel sonst — immer genau ein `h1`", () => {
    assert.match(
      ansicht,
      /<div className=\{cn\(imArtikel \? "hidden" : "lg:hidden"\)\}>\s*<PageHeader word=\{t\.word\} title=\{t\.title\} description=\{lead\} \/>\s*<\/div>/,
    );
    assert.match(
      ansicht,
      /\{open && \(\s*<div className=\{cn\(imArtikel \? "block" : "hidden lg:block"\)\}>\s*<PageHeader\s+word=\{t\.word\}\s+title=\{open\.title\}\s+description=\{artikelZeile\}\s+titleId="wiki-titel"\s+titleRef=\{titelRef\}\s+titleLang=\{open\.language !== locale \? open\.language : undefined\}\s*\/>/,
    );
    assert.equal((ansicht.match(/<PageHeader\b/g) ?? []).length, 3, "Liste, Artikel, leerer Zustand");
  });

  it("der Artikeltitel nennt darunter Thema und Stand, dahinter die Marken — und steht nicht mehr in der Karte", () => {
    assert.match(ansicht, /\[themaName, stand \? t\.updated\.replace\("\{date\}", stand\) : ""\]\.filter\(Boolean\)\.join\(" · "\)/);
    for (const marke of [
      /<Badge>\{phases\[open\.phase\] \?\? open\.phase\}<\/Badge>/,
      /<Badge tone="accent">\{t\.thisEdition\}<\/Badge>/,
      /<Badge>\{t\.otherLanguage\}<\/Badge>/,
    ]) {
      assert.match(ansicht, marke);
    }
    assert.doesNotMatch(ansicht, /<h2 id="wiki-titel"/);
    assert.doesNotMatch(ansicht, /ct-eyebrow mb-1 text-muted">\{themaName\}/);
  });

  it("der Satz unter „Wiki“ steht am Desktop über der Suche (am Handy unter dem Titel)", () => {
    const satz = ansicht.indexOf('<p className="ct-help hidden lg:block">{lead}</p>');
    const suche = ansicht.indexOf("<SuchFeld");
    assert.ok(satz > 0 && suche > satz, "Satz vor der Suche");
  });

  it("der gewählte Artikel in der Liste trägt einen Balken links in Akzent und weiße Fläche; die anderen bleiben gedämpft", () => {
    assert.match(
      ansicht,
      /"ct-label min-h-11 w-full rounded-r-ct-sm border-l-2 px-2\.5 py-1\.5 text-left transition-colors",\s*markiert\(a\.id\)\s*\? "border-accent bg-surface text-ink"\s*: "border-transparent text-muted hover:bg-surface-hover hover:text-ink",/,
    );
    assert.match(ansicht, /aria-current=\{markiert\(a\.id\) \? "true" : undefined\}/);
    assert.doesNotMatch(ansicht, /"bg-surface-hover text-ink"/);
  });

  it("der Balken trägt: Akzent gegen den Seitengrund erreicht 3 : 1 (WCAG 1.4.11) — gemessen aus den Tokens", () => {
    const r = kontrast(farbe("accent"), farbe("canvas"));
    assert.ok(r >= 3, `accent gegen canvas ${r.toFixed(2)} : 1`);
  });

  it("„Mehr zu …“ ist ein `h2` in der Größe `ct-h3` — es steht neben den Abschnitten, nicht unter dem letzten", () => {
    assert.match(ansicht, /<h2 id="wiki-verwandt" className="ct-h3 mb-2">/);
    assert.doesNotMatch(ansicht, /<h3 id="wiki-verwandt"/);
  });

  it("der Assistent kommt als fertiges Element und steht wie bisher unter dem Kopf, vor Liste und Artikel — in einem eigenen Element", () => {
    const assistent = ansicht.indexOf("<div>{assistent}</div>");
    const spalten = ansicht.indexOf('<div className="flex flex-col gap-6 lg:flex-row lg:items-start">');
    assert.ok(assistent > 0 && spalten > assistent);
    assert.match(ansicht, /assistent\?: ReactNode;/);
    // Auch im leeren Zustand gibt es Kopf, Assistent und Hinweis.
    assert.match(ansicht, /<PageHeader word=\{t\.word\} title=\{t\.title\} description=\{lead\} \/>\s*\{assistent\}\s*<EmptyState/);
  });

  it("`WikiPage` zeichnet keinen Seitenkopf mehr: der Satz (beim Partner mit dem Filterhinweis) und der Assistent gehen an `WikiView`", () => {
    assert.doesNotMatch(seite, /PageHeader/);
    assert.match(seite, /lead=\{formats \? `\$\{t\.wiki\.lead\} \$\{t\.wiki\.partnerFilterNote\}` : t\.wiki\.lead\}/);
    assert.match(seite, /assistent=\{\s*<Assistent\b/);
    assert.match(seite, /<WikiView\s+articles=\{articles\}/);
  });

  it("`PageHeader` reicht Kennung, Referenz und Sprache an den Titel; `tabIndex={-1}` nur mit Referenz — andere Seiten bleiben, wie sie waren", () => {
    assert.match(kopf, /titleId\?: string;/);
    assert.match(kopf, /titleRef\?: Ref<HTMLHeadingElement>;/);
    assert.match(kopf, /titleLang\?: string;/);
    assert.match(
      kopf,
      /<h1 id=\{titleId\} ref=\{titleRef\} lang=\{titleLang\} tabIndex=\{titleRef \? -1 : undefined\} className="ct-h1 text-ink">/,
    );
    // Der Fokus springt am Handy weiter auf den Titel des Artikels.
    assert.match(ansicht, /titelRef\.current\?\.focus\(\)/);
  });

  it("jede Wiki-Seite der Bereiche benutzt weiter `WikiPage`: Partner, Speaker, Volunteers — der Admin hat seine eigene Seite", () => {
    for (const p of [
      "app/(partner)/partner/wiki/page.tsx",
      "app/(speaker)/speaker/wiki/page.tsx",
      "app/(volunteers)/volunteers/wiki/page.tsx",
    ]) {
      assert.match(src(p), /<WikiPage\b/, p);
    }
  });
});

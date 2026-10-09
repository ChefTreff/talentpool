import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { assistentOffen } from "@/lib/wiki/gespraech";

/**
 * K-92 (1) (Konrad 09.10.2026, Empfehlung angenommen): der Wiki-Assistent steht **in der Liste**, nicht mehr als Karte zwischen
 * Seitentitel und Artikel. Dort trennte er den Titel vom Text — am Handy mit 498 px, bevor Suche und Themen kamen.
 *
 * Er ist jetzt eine Zeile „Frag Chefi“ unter der Suche (ein Aufklappen: `<details>`), aufgeklappt, solange ein Gespräch läuft. Die
 * Regel steht ausführbar in `lib/wiki/gespraech.ts` (`assistentOffen`); die Gestalt ist Quelltext — einen DOM-Testlauf gibt es im
 * Repo nicht, Maße stehen in der PR-Beschreibung. Nicht berührt: das Gespräch (`useGespraech`), die Bubble, die Server-Aktion.
 */

const ohneKommentare = (q: string) => q.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const lies = (p: string) => ohneKommentare(readFileSync(p, "utf8"));
const assistent = lies("components/wiki/Assistent.tsx");
const ansicht = lies("components/wiki/WikiView.tsx");
const bubble = lies("components/wiki/AssistentBubble.tsx");
const seite = lies("components/wiki/WikiPage.tsx");

describe("K-92: wann der Assistent in der Liste offen ist (ausgeführt)", () => {
  it("ohne Gespräch und ohne Wahl zugeklappt; mit Gespräch aufgeklappt", () => {
    assert.equal(assistentOffen(null, 0), false);
    assert.equal(assistentOffen(null, 1), true);
    assert.equal(assistentOffen(null, 40), true);
  });

  it("die Wahl von Hand gilt immer — auch wenn danach ein Gespräch entsteht oder endet", () => {
    assert.equal(assistentOffen(true, 0), true, "aufgeklappt und leer (z. B. nach „Neues Gespräch“) bleibt offen");
    assert.equal(assistentOffen(false, 3), false, "zugeklappt trotz Gespräch");
    assert.equal(assistentOffen(true, 3), true);
    assert.equal(assistentOffen(false, 0), false);
  });
});

describe("K-92: der Assistent steht in der Liste, nicht zwischen Titel und Text", () => {
  it("in der Listenspalte: nach Suche und Trefferzahl, vor den Themen — und nicht mehr vor den Spalten", () => {
    const spalten = ansicht.indexOf('<div className="flex flex-col gap-6 lg:flex-row lg:items-start">');
    const liste = ansicht.indexOf("<aside ");
    const status = ansicht.indexOf('<p role="status"');
    const element = ansicht.indexOf("<div>{assistent}</div>");
    const themen = ansicht.indexOf('<nav aria-labelledby="wiki-liste">');
    const artikel = ansicht.indexOf("<article");
    assert.ok(spalten > 0 && liste > spalten && status > liste && element > status && themen > element && artikel > themen);
    assert.equal(ansicht.split("<div>{assistent}</div>").length - 1, 1, "genau einmal im Seitenaufbau (der leere Zustand hat sein eigenes `{assistent}`)");
    assert.match(ansicht, /<PageHeader word=\{t\.word\} title=\{t\.title\} description=\{lead\} \/>\s*\{assistent\}\s*<EmptyState/, "ohne Artikel gibt es keine Liste: dort bleibt er unter dem Kopf");
  });

  it("am Handy verschwindet er mit der Liste, sobald ein Artikel gelesen wird (die Bubble bleibt auf jeder Seite)", () => {
    assert.match(ansicht, /<aside className=\{cn\("shrink-0 flex-col gap-4 lg:flex lg:w-72", imArtikel \? "hidden" : "flex"\)\}>/);
    assert.match(bubble, /rahmen="panel"/);
  });

  it("`WikiPage` reicht ihn unverändert weiter: dasselbe Gespräch, dieselben Vorschläge, derselbe Besitzer", () => {
    assert.match(seite, /assistent=\{\s*<Assistent\b/);
    assert.match(seite, /besitzer=\{user\?\.id \?\? ""\}/);
    assert.match(seite, /vorschlaege=\{vorschlaegeFuer\(t\.wikiAssistent, audience\)\}/);
  });
});

describe("K-92: die Gestalt — eine Zeile, die aufklappt", () => {
  it("`rahmen=\"liste\"` ist die Vorgabe, die Bubble behält `panel`; die Karte mit Außenabstand ist weg", () => {
    assert.match(assistent, /rahmen = "liste",/);
    assert.match(assistent, /rahmen\?: "liste" \| "panel";/);
    assert.doesNotMatch(assistent, /<Card\b|@\/components\/ui\/Card|mb-6/);
  });

  it("ein `<details>`, dessen Zustand aus `assistentOffen` kommt; die Wahl von Hand merkt sich `onToggle`", () => {
    assert.match(assistent, /const \[gewaehlt, setGewaehlt\] = useState<boolean \| null>\(null\);/);
    assert.match(assistent, /const offen = assistentOffen\(gewaehlt, zuege\.length\);/);
    assert.match(assistent, /<details\s+open=\{offen\}\s+onToggle=\{\(e\) => setGewaehlt\(e\.currentTarget\.open\)\}\s+className="group rounded-ct-lg border bg-surface"\s*>/);
  });

  it("die Zeile ist 44 px hoch, trägt den Titel und ein Pfeil, der sich beim Öffnen dreht; der Titel steht in `t.title`", () => {
    assert.match(assistent, /<summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-ct-lg px-4 ct-label text-ink [^"]*\[&::-webkit-details-marker\]:hidden">\s*\{t\.title\}/);
    assert.match(assistent, /className="h-4 w-4 shrink-0 text-accent group-open:rotate-180"/);
  });

  it("dahinter stehen Satz und Gespräch wie bisher (`t.lead`, dann der Inhalt mit Vorschlägen, Verlauf, Feld und Hinweis)", () => {
    assert.match(assistent, /<div className="px-4 pb-4">\s*<p className="ct-help">\{t\.lead\}<\/p>\s*\{inhalt\}\s*<\/div>/);
    assert.match(assistent, /<form\s+className="mt-4 flex items-start gap-2"/);
    assert.match(assistent, /\{t\.privacy\}/);
  });

  it("`useGespraech` ist unberührt: derselbe Speicher für Liste und Bubble", () => {
    assert.match(assistent, /const \{ zuege, laeuft, fragen, neu \} = useGespraech\(\{\s*besitzer,\s*zielgruppe: audience,\s*sprache: locale,\s*nichtsText: t\.noHit,\s*\}\);/);
  });

  it("die Texte stehen in Deutsch und Englisch (Titel und Satz sind schon da)", () => {
    for (const sprache of ["de", "en"]) {
      const t = JSON.parse(readFileSync(`lib/i18n/${sprache}.json`, "utf8")).wikiAssistent as Record<string, string>;
      assert.ok(t.title?.trim() && t.lead?.trim(), sprache);
    }
  });
});

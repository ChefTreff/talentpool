import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { instanzSuffix, tischWahl, vorgabeMasterclass, vorgabeTisch, waehleInstanz } from "@/lib/partner/instanz";
import { rueckgabeOffen } from "@/lib/partner/rueckgabe";

/**
 * QS-079, zweiter Einsatz (Interview Tables): ab zwei Tischen wählt der Umschalter (`?instanz=<Fläche>`) den Tisch, darunter steht genau ein Block, und die Sichten
 * zeigen nur die Gespräche dieses Tisches. Die Regeln (welcher Tisch öffnet, wie der Reiter heißt) als Verhalten, die Verdrahtung am Quelltext — Komponenten lädt
 * der Testlader nicht.
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const ohneKommentare = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const partner = (p: string) => ohneKommentare(quelle(`app/(partner)/partner/${p}`));

const offen = { return_note: "Bitte die Zeiten prüfen", returned_at: "2026-10-08T10:00:00Z", publish_status: "draft" };
const ruhig = { return_note: null, returned_at: null, publish_status: "review" };
const gespraech = (stage_id: string | null, teil: Partial<typeof offen> = {}) => ({ stage_id, ...ruhig, ...teil });

describe("Rückgabe offen: nur solange die Session wieder beim Partner liegt", () => {
  it("Grund, Zeitpunkt und Entwurf — alle drei", () => {
    assert.equal(rueckgabeOffen(offen), true);
    assert.equal(rueckgabeOffen({ ...offen, publish_status: "review" }), false, "nach einer neuen Anfrage ist die Programmleitung wieder dran");
    assert.equal(rueckgabeOffen({ ...offen, publish_status: "published" }), false);
    assert.equal(rueckgabeOffen({ ...offen, return_note: null }), false);
    assert.equal(rueckgabeOffen({ ...offen, return_note: "" }), false);
    assert.equal(rueckgabeOffen({ ...offen, returned_at: null }), false);
    assert.equal(rueckgabeOffen({ ...offen, publish_status: null }), false);
  });
});

describe("Vorgabe Masterclass: die, die etwas will", () => {
  const voll = { title_de: "Titel", description_de: "Text", ...ruhig };
  it("zuerst die zurückgegebene, dann die ohne Inhalt, sonst keine", () => {
    const a = { id: "a", ...voll };
    const b = { id: "b", ...voll, description_de: null };
    const c = { id: "c", ...voll, ...offen };
    assert.equal(vorgabeMasterclass([a, b, c])?.id, "c", "die zurückgegebene schlägt die ohne Beschreibung");
    assert.equal(vorgabeMasterclass([a, b])?.id, "b");
    assert.equal(vorgabeMasterclass([a])?.id, undefined);
    assert.equal(waehleInstanz([a, { ...a, id: "z" }], undefined, vorgabeMasterclass)?.id, "a", "ohne etwas Offenes die erste");
  });
});

describe("Vorgabe Tisch: der mit einem zurückgegebenen Gespräch, sonst einer ohne Gespräche", () => {
  const tische = [{ id: "t1" }, { id: "t2" }, { id: "t3" }];

  it("ein zurückgegebenes Gespräch schlägt einen leeren Tisch", () => {
    assert.equal(vorgabeTisch(tische, [gespraech("t1"), gespraech("t2", offen)])?.id, "t2");
    assert.equal(vorgabeTisch(tische, [gespraech("t3", offen), gespraech("t1"), gespraech("t2")])?.id, "t3");
  });

  it("ohne Rückgabe: der erste Tisch ohne jedes Gespräch — dort ist das Anlegen der nächste Schritt", () => {
    assert.equal(vorgabeTisch(tische, [gespraech("t1"), gespraech("t3")])?.id, "t2");
    assert.equal(vorgabeTisch(tische, [])?.id, "t1");
  });

  it("jeder Tisch hat Gespräche, keines ist offen: keine Vorgabe — dann gilt der erste", () => {
    const alle = [gespraech("t1"), gespraech("t2"), gespraech("t3")];
    assert.equal(vorgabeTisch(tische, alle), undefined);
    assert.equal(waehleInstanz(tische, undefined, (l) => vorgabeTisch(l, alle))?.id, "t1");
  });

  it("zählt nur, was am Tisch hängt — die Fläche, nicht der Name; eine Rückgabe im Stand `review` zählt nicht", () => {
    assert.equal(vorgabeTisch(tische, [gespraech(null, offen), gespraech("t1"), gespraech("t2"), gespraech("t3")]), undefined, "ohne Tisch gehört es zu keinem");
    assert.equal(vorgabeTisch(tische, [gespraech("t1", { return_note: "alt", returned_at: "2026-10-01T10:00:00Z", publish_status: "review" }), gespraech("t2"), gespraech("t3")]), undefined);
  });
});

describe("Tischwahl: gewählter Tisch und Umschalter", () => {
  const nummer = (n: number) => `Tisch ${n}`;
  const tische = [
    { id: "t1", name: "TEST — Interview Table" },
    { id: "t2", name: "TEST — Interview Table 2" },
  ];

  it("der Wunsch gewinnt, der Reiter trägt den Namen des Tisches", () => {
    const w = tischWahl(tische, [gespraech("t1"), gespraech("t2")], "t2", nummer);
    assert.equal(w.gewaehlt?.id, "t2");
    assert.deepEqual(w.instanzen, {
      items: [{ id: "t1", label: "TEST — Interview Table" }, { id: "t2", label: "TEST — Interview Table 2" }],
      gewaehlt: "t2",
    });
  });

  it("ohne Wunsch oder mit unbekannter Kennung: die Vorgabe — kein Fehler", () => {
    const gespraeche = [gespraech("t1"), gespraech("t2", offen)];
    assert.equal(tischWahl(tische, gespraeche, undefined, nummer).gewaehlt?.id, "t2");
    assert.equal(tischWahl(tische, gespraeche, "gibt-es-nicht", nummer).gewaehlt?.id, "t2");
  });

  it("gleiche Namen werden „Tisch 1“ und „Tisch 2“ — sonst sähen die Reiter gleich aus", () => {
    const w = tischWahl([{ id: "a", name: "Tisch" }, { id: "b", name: "tisch" }], [], undefined, nummer);
    assert.deepEqual(w.instanzen?.items.map((x) => x.label), ["Tisch 1", "Tisch 2"]);
  });

  it("einen Umschalter gibt es erst ab zwei Tischen; ohne Tisch gibt es keinen gewählten", () => {
    const einer = tischWahl(tische.slice(0, 1), [gespraech("t1")], undefined, nummer);
    assert.equal(einer.gewaehlt?.id, "t1");
    assert.equal(einer.instanzen, null, "bei einem Tisch ist die Seite wie vorher");
    const keiner = tischWahl([], [], "t1", nummer);
    assert.equal(keiner.gewaehlt, null);
    assert.equal(keiner.instanzen, null);
  });

  it("der Adressanhang der Sichten: die gewählte Instanz, ohne Umschalter nichts", () => {
    assert.equal(instanzSuffix(tischWahl(tische, [], "t2", nummer).instanzen), "?instanz=t2");
    assert.equal(instanzSuffix(tischWahl(tische.slice(0, 1), [], undefined, nummer).instanzen), "");
    assert.equal(instanzSuffix(null), "");
  });
});

describe("Interview Tables: ein Tisch, vier Sichten, die Wahl reist mit", () => {
  const seite = partner("interview-tables/page.tsx");

  it("die Formatseite wählt den Tisch nach `?instanz`, zeichnet nur diesen und setzt `key` — keine Schleife über alle Tische", () => {
    assert.match(seite, /\{ searchParams \}: \{ searchParams: Promise<\{ instanz\?: string \| string\[\] \}> \}/);
    assert.match(seite, /tischWahl\(flaechen\.stages, sessions, instanzKennung\(instanz\), \(n\) => s\.instanceNumber\.replace\("\{n\}", String\(n\)\)\)/);
    assert.match(seite, /<TischeView\s+key=\{gewaehlt\.id\}/);
    assert.match(seite, /tisch=\{gewaehlt\}/);
    assert.match(seite, /sessions=\{sessions\.filter\(\(x\) => x\.stage_id === gewaehlt\.id\)\}/);
    assert.match(seite, /days=\{flaechen\.days\.filter\(\(d\) => d\.event_id === gewaehlt\.event_id\)\}/);
    assert.doesNotMatch(seite, /flaechen\.stages\.map\(/);
    assert.equal((seite.match(/<TischeView/g) ?? []).length, 1);
  });

  it("der Umschalter steht über den Sichten und auch ohne Gespräche; die Sichten nehmen die Wahl mit", () => {
    assert.match(seite, /<InstanzWahl leiste=\{instanzen\} label=\{s\.instanceLabel\} \/>/);
    assert.ok(seite.indexOf("<InstanzWahl") < seite.indexOf("<FormatReiter"), "Umschalter vor den Sichten");
    assert.match(seite, /\{sessions\.length > 0 && \(\s*<FormatReiter[\s\S]*?suffix=\{instanzSuffix\(instanzen\)\}/);
    // Der Umschalter hängt nicht an den Gesprächen: ein zweiter Tisch ohne Gespräche muss wählbar sein, um dort Zeitfenster anzulegen —
    // er steht nicht in der Bedingung, die nur die Reiter umgibt.
    const umschalter = seite.slice(seite.indexOf("<InstanzWahl"), seite.indexOf("{sessions.length > 0 && ("));
    assert.ok(umschalter.startsWith("<InstanzWahl") && !/sessions\.length/.test(umschalter), "InstanzWahl steht vor der Bedingung der Reiter");
    assert.doesNotMatch(seite.slice(seite.indexOf("<PageHeader"), seite.indexOf("<InstanzWahl")), /&&/, "auch davor keine Bedingung");
  });

  it("die Überschrift mit dem Tischnamen steht erst mit dem Umschalter, wie vorher erst ab zwei Tischen", () => {
    assert.match(seite, /\{instanzen && <h2 className="ct-h2 mb-3 text-ink">\{gewaehlt\.name\}<\/h2>\}/);
  });

  it("der Weg zu den Bewerbungen im Block nimmt den Tisch mit", () => {
    assert.match(seite, /bewerbungenHref=\{`\/partner\/interview-tables\/bewerbungen\$\{instanzSuffix\(instanzen\)\}`\}/);
    const ansicht = partner("interview-tables/TischeView.tsx");
    assert.match(ansicht, /<Link href=\{bewerbungenHref\} className="ct-link">/);
    assert.doesNotMatch(ansicht, /href="\/partner\/interview-tables\/bewerbungen"/);
  });

  it("wer auf einem Tisch tippt und den Tisch wechselt, wird gefragt — und nach dem Speichern oder Anlegen nicht mehr", () => {
    const ansicht = partner("interview-tables/TischeView.tsx");
    assert.match(ansicht, /import \{ useUngesichert, type UngesichertTexte \} from "@\/components\/ui\/useUngesichert";/);
    assert.match(ansicht, /unsaved: UngesichertTexte;/);
    // Verglichen wird alles, was man eintippen kann: Zeitfenster, Ausschreibung, Profil.
    assert.match(ansicht, /const \[basis, setBasis\] = useState\(\{ plan, posting, profil \}\);/);
    assert.match(ansicht, /const geaendert = JSON\.stringify\(\{ plan, posting, profil \}\) !== JSON\.stringify\(basis\);/);
    assert.match(ansicht, /const warnung = useUngesichert\(canEdit && geaendert, unsaved\);/);
    // Gesichert ist es, wenn es gespeichert ist: mit den Gesprächen angelegt (alles) oder als Ausschreibung gespeichert (nur Ausschreibung und Profil).
    assert.match(ansicht, /setBasis\(\{ plan, posting, profil \}\);\s*router\.refresh\(\);/);
    assert.match(ansicht, /setBasis\(\(b\) => \(\{ \.\.\.b, posting, profil \}\)\);\s*router\.refresh\(\);/);
    assert.match(ansicht, /\{warnung\}\s*<\/div>\s*\);\s*\}\s*$/);
    assert.match(seite, /unsaved=\{t\.common\.unsaved\}/);
  });

  for (const [datei, ansicht] of [["bewerbungen", "bewerbungen"], ["teilnehmende", "teilnehmende"], ["fragen", "fragen"]] as const) {
    it(`${datei}/page.tsx reicht die Wahl an die gemeinsame Unterseite weiter`, () => {
      const s = partner(`interview-tables/${datei}/page.tsx`);
      assert.match(s, /\{ searchParams \}: \{ searchParams: Promise<\{ instanz\?: string \| string\[\] \}> \}/);
      assert.match(s, /const \{ instanz \} = await searchParams;/);
      assert.match(s, new RegExp(`<FormatUnterseite format="interview_table" ansicht="${ansicht}" instanz=\\{instanz\\} />`));
    });
  }

  it("die gemeinsame Unterseite filtert nur bei Interview Tables und nur mit Umschalter; ein Tisch ohne Gespräche zeigt den Leerzustand", () => {
    const u = partner("FormatUnterseite.tsx");
    assert.match(u, /instanz\?: string \| string\[\];/);
    assert.match(u, /if \(format === "interview_table"\) \{\s*const flaechen = await ladeFlaechen\(supabase, current\.org_id, "interview_table"\);/);
    assert.match(u, /tischWahl\(flaechen\.stages, alle, instanzKennung\(instanz\), \(n\) => s\.instanceNumber\.replace\("\{n\}", String\(n\)\)\)/);
    assert.match(u, /if \(instanzen && wahl\.gewaehlt\) \{\s*const tischId = wahl\.gewaehlt\.id;\s*sessions = alle\.filter\(\(x\) => x\.stage_id === tischId\);/);
    assert.match(u, /\{alle\.length === 0 \? \(/);
    assert.match(u, /<InstanzWahl leiste=\{instanzen\} label=\{s\.instanceLabel\} \/>/);
    assert.ok(u.indexOf("<InstanzWahl") < u.indexOf("<FormatReiter"), "Umschalter vor den Sichten");
    assert.match(u, /<FormatReiter[\s\S]*?suffix=\{instanzSuffix\(instanzen\)\}/);
    assert.match(u, /\{sessions\.length === 0 \? \(\s*<EmptyState title=\{b\.noSessionsTitle\}/);
    // Das Side-Event (ein Ort je Organisation) bleibt, wie es war: dort wird nichts gefiltert.
    assert.equal((u.match(/ladeFlaechen\(/g) ?? []).length, 1);
  });
});

describe("Texte: Tisch-Umschalter in beiden Sprachen", () => {
  it("`instanceLabel` und `instanceNumber` stehen in DE und EN, die Nummer trägt ihren Platzhalter, deutsch in der Ihr-Ansprache", () => {
    for (const sprache of ["de", "en"] as const) {
      const t = (JSON.parse(quelle(`lib/i18n/${sprache}.json`)) as { partnerInterviewTables: Record<string, string> }).partnerInterviewTables;
      assert.equal(typeof t.instanceLabel, "string", `${sprache}: instanceLabel`);
      assert.ok(t.instanceLabel.length >= 5);
      assert.match(t.instanceNumber, /\{n\}/, `${sprache}: instanceNumber trägt {n}`);
      assert.ok(!/\bSie\b|\bIhre[mnrs]?\b/.test(t.instanceLabel), `${sprache}: keine Sie-Ansprache`);
    }
  });
});

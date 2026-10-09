import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { brauchtInhalt, instanzHref, instanzKennung, instanzLeiste, instanzTitel, kurzSlot, waehleInstanz } from "@/lib/partner/instanz";

/**
 * QS-079 + PART-149 (Konrad 09.10.2026), Masterclass zuerst: ab zwei Masterclasses wählt ein Umschalter (`?instanz=`) die eine, die darunter steht
 * (Formulare genau einmal); „Speaker eintragen“ steht in der Kopfzeile des Blocks, „Angaben pflegen“ in der Zeile. Die Regeln sind reine Funktionen
 * (`lib/partner/instanz.ts`), die Verdrahtung wird am Quelltext geprüft — Komponenten lädt der Testlader nicht.
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const ohneKommentare = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const seite = (p: string) => ohneKommentare(quelle(`app/(partner)/partner/masterclass/${p}`));

describe("Instanz wählen: gewünscht, sonst Vorgabe, sonst die erste — nie ein Fehler", () => {
  const liste = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("die gewünschte Instanz gewinnt, auch gegen die Vorgabe der Seite", () => {
    assert.equal(waehleInstanz(liste, "b")?.id, "b");
    assert.equal(waehleInstanz(liste, "b", () => liste[2])?.id, "b");
  });

  it("ohne Wunsch oder mit unbekannter Kennung: die Vorgabe der Seite, sonst die erste — kein 404", () => {
    assert.equal(waehleInstanz(liste, undefined)?.id, "a");
    assert.equal(waehleInstanz(liste, "gibt-es-nicht")?.id, "a");
    assert.equal(waehleInstanz(liste, undefined, (l) => l[2])?.id, "c");
    assert.equal(waehleInstanz(liste, "gibt-es-nicht", (l) => l[1])?.id, "b");
    assert.equal(waehleInstanz(liste, undefined, () => undefined)?.id, "a", "findet die Vorgabe nichts, gilt die erste");
  });

  it("ohne Instanzen gibt es keine", () => {
    assert.equal(waehleInstanz([], "a"), null);
    assert.equal(waehleInstanz([], undefined, () => ({ id: "x" })), null);
  });

  it("die Kennung aus der Adresse: die erste, ohne Leerraum; leer heißt keine", () => {
    assert.equal(instanzKennung(undefined), undefined);
    assert.equal(instanzKennung(""), undefined);
    assert.equal(instanzKennung("   "), undefined);
    assert.equal(instanzKennung(" a "), "a");
    assert.equal(instanzKennung(["a", "b"]), "a");
    assert.equal(instanzKennung([]), undefined);
  });

  it("die Adresse einer Instanz ist nur die Abfrage und verträgt Sonderzeichen", () => {
    assert.equal(instanzHref("abc"), "?instanz=abc");
    assert.equal(instanzHref("a b&c"), "?instanz=a%20b%26c");
  });
});

describe("Reiterbeschriftung: der Titel, bei fehlendem oder doppeltem Titel Nummer und Slot", () => {
  const nummer = (n: number) => `Masterclass ${n}`;

  it("verschiedene Titel stehen so da — ohne den Leerraum, der außen hängt", () => {
    assert.deepEqual(
      instanzTitel([{ titel: "Employer Branding", slot: "Fr 10:00" }, { titel: "Recruiting", slot: "Fr 14:00" }], nummer),
      ["Employer Branding", "Recruiting"],
    );
    assert.deepEqual(instanzTitel([{ titel: "  Employer Branding ", slot: null }, { titel: "Recruiting", slot: null }], nummer), ["Employer Branding", "Recruiting"]);
  });

  it("gleiche Titel (auch in anderer Schreibung) werden zu Nummer und Slot — sonst sähen die Reiter gleich aus", () => {
    assert.deepEqual(
      instanzTitel([{ titel: "TEST — Masterclass", slot: "Fr 10:00" }, { titel: "test — masterclass", slot: "Fr 14:00" }], nummer),
      ["Masterclass 1 · Fr 10:00", "Masterclass 2 · Fr 14:00"],
    );
  });

  it("ohne Titel (leer, nur Leerzeichen, null) gilt Nummer und Slot; ohne Slot nur die Nummer", () => {
    assert.deepEqual(
      instanzTitel([{ titel: null, slot: "Fr 10:00" }, { titel: "   ", slot: null }], nummer),
      ["Masterclass 1 · Fr 10:00", "Masterclass 2"],
    );
  });

  it("die Nummer ist die Stelle in der Liste, nicht die Zahl der Titellosen", () => {
    assert.deepEqual(instanzTitel([{ titel: "Recruiting", slot: null }, { titel: null, slot: null }], nummer), ["Recruiting", "Masterclass 2"]);
  });

  it("der Slot als Kurzform in Berliner Zeit: Wochentag ohne Punkt und Uhrzeit", () => {
    assert.equal(kurzSlot("2027-04-16T08:00:00Z", "de-DE"), "Fr 10:00");
    assert.equal(kurzSlot("2027-04-16T12:30:00Z", "de-DE"), "Fr 14:30");
    assert.equal(kurzSlot("2027-04-16T22:30:00Z", "de-DE"), "Sa 00:30", "22:30 UTC ist in Berlin schon der nächste Tag");
    assert.equal(kurzSlot("2027-04-16T08:00:00Z", "en-GB"), "Fri 10:00");
  });

  it("kein Slot und kein Datum geben keinen Slot", () => {
    assert.equal(kurzSlot(null, "de-DE"), null);
    assert.equal(kurzSlot("", "de-DE"), null);
    assert.equal(kurzSlot("kein-datum", "de-DE"), null);
  });
});

describe("Vorgabe und Umschalter", () => {
  it("was die Person noch liefern muss: Titel oder Beschreibung (deutsch) fehlen", () => {
    assert.equal(brauchtInhalt({ title_de: "Titel", description_de: "Text" }), false);
    assert.equal(brauchtInhalt({ title_de: null, description_de: "Text" }), true);
    assert.equal(brauchtInhalt({ title_de: "Titel", description_de: "   " }), true);
    assert.equal(brauchtInhalt({ title_de: "", description_de: null }), true);
  });

  it("den Umschalter gibt es ab zwei Instanzen — bei einer ist die Seite wie vorher", () => {
    const eintraege = [{ id: "a", label: "A" }, { id: "b", label: "B" }];
    assert.deepEqual(instanzLeiste(eintraege, "b"), { items: eintraege, gewaehlt: "b" });
    assert.equal(instanzLeiste(eintraege.slice(0, 1), "a"), null);
    assert.equal(instanzLeiste([], undefined), null);
    assert.equal(instanzLeiste(eintraege, undefined), null, "ohne gewählte Instanz gibt es nichts zu zeigen");
  });
});

describe("Masterclass: eine Instanz, vier Sichten, die Wahl reist mit", () => {
  const daten = seite("daten.ts");

  it("der Lader nimmt `?instanz` und wählt für alle Reiter nach derselben Regel: zurückgegeben, sonst ohne Inhalt, sonst die erste", () => {
    assert.match(daten, /export async function ladeMasterclass\(instanz\?: string \| string\[\]\)/);
    assert.match(
      daten,
      /waehleInstanz\(sessions, instanzKennung\(instanz\), \(liste\) => liste\.find\(\(x\) => rueckgabeOffen\(x\)\) \?\? liste\.find\(brauchtInhalt\)\)/,
    );
    assert.match(daten, /instanzen: instanzLeiste\(sessions\.map\(\(x, i\) => \(\{ id: x\.id, label: titel\[i\] \}\)\), gewaehlt\?\.id\),/);
    assert.match(daten, /\(n\) => t\.partnerMasterclass\.instanceNumber\.replace\("\{n\}", String\(n\)\)/);
    assert.match(daten, /return \{[\s\S]*?\bgewaehlt,/);
  });

  it("die Inhaltsseite zeichnet nur die gewählte Masterclass, mit `key`, und nur deren Speaker — nie eine Schleife über alle", () => {
    const s = seite("page.tsx");
    assert.match(s, /\{ searchParams \}: \{ searchParams: Promise<\{ instanz\?: string \| string\[\] \}> \}/);
    assert.match(s, /await ladeMasterclass\(instanz\)/);
    assert.match(s, /\{gewaehlt && \(\s*<Instanz\s+key=\{gewaehlt\.id\}\s+x=\{gewaehlt\}/);
    assert.match(s, /speakers=\{speakers\.filter\(\(sp\) => sp\.session_id === gewaehlt\.id\)\}/);
    assert.doesNotMatch(s, /sessions\.map\(/);
    assert.match(s, /<MasterclassKopf [^>]*instanzen=\{instanzen\}/);
  });

  for (const [datei, nurTeilnehmende] of [["bewerbungen/page.tsx", false], ["teilnehmende/page.tsx", true], ["fragen/page.tsx", null]] as const) {
    it(`${datei}: nur die gewählte Masterclass, derselbe Umschalter darüber`, () => {
      const s = seite(datei);
      assert.match(s, /\{ searchParams \}: \{ searchParams: Promise<\{ instanz\?: string \| string\[\] \}> \}/);
      assert.match(s, /await ladeMasterclass\(instanz\)/);
      assert.match(s, /\{gewaehlt && \(\s*<Format(Bewerbungen|Fragen)/);
      assert.match(s, /sessions=\{\[gewaehlt\]\}/);
      assert.doesNotMatch(s, /sessions=\{sessions\}/, "nicht mehr alle Masterclasses untereinander");
      assert.match(s, /<MasterclassKopf [^>]*instanzen=\{instanzen\}/);
      if (nurTeilnehmende !== null) assert.match(s, nurTeilnehmende ? /\bnurTeilnehmende\b(?!=)/ : /nurTeilnehmende=\{false\}/);
    });
  }

  it("der Umschalter steht über den Sichten, nie in derselben Leiste, und nur ab zwei Masterclasses", () => {
    const k = seite("MasterclassKopf.tsx");
    assert.match(k, /\{instanzen && \(\s*<SectionTabs\s+label=\{t\.instanceLabel\}/);
    assert.ok(k.indexOf("<SectionTabs") < k.indexOf("<FormatReiter"), "Umschalter vor den Sichten");
    assert.match(k, /href: instanzHref\(x\.id\), label: x\.label, aktiv: x\.id === instanzen\.gewaehlt/);
    // Die Sichten nehmen die gewählte mit; ohne Umschalter bleiben ihre Adressen, wie sie waren.
    assert.match(k, /suffix=\{instanzen \? instanzHref\(instanzen\.gewaehlt\) : ""\}/);
    const reiter = ohneKommentare(quelle("app/(partner)/partner/FormatReiter.tsx"));
    assert.match(reiter, /suffix = ""/);
    assert.equal((reiter.match(/\$\{suffix\}/g) ?? []).length, 4);
  });

  it("`SectionTabs` vergleicht den Pfad, nicht die Abfrage — sonst wäre mit `?instanz=` kein Reiter mehr aktiv", () => {
    const t = ohneKommentare(quelle("components/layout/SectionTabs.tsx"));
    assert.match(t, /const pfad = item\.href\.split\("\?"\)\[0\];/);
    assert.match(t, /pathname === pfad \|\|/);
    assert.match(t, /pathname\.startsWith\(`\$\{pfad\}\/`\)/);
    assert.doesNotMatch(t, /pathname === item\.href/);
    // Die Adresszeilen-Reiter (`aktiv`) behalten Vorrang.
    assert.match(t, /item\.aktiv !== undefined \? item\.aktiv : item\.exact/);
  });
});

describe("„Wer spricht“: Hinzufügen in die Kopfzeile, Bearbeiten in die Zeile (PART-149)", () => {
  const instanz = seite("Instanz.tsx");

  it("der Knopf steht in der Kopfzeile des Blocks, sobald es eine Liste gibt; im Leerzustand trägt er die eine Aktion", () => {
    assert.match(instanz, /const eintragen = canEdit \? <SpeakerHinzufuegen sessionId=\{x\.id\} opsName=\{opsName\} t=\{talk\} rpcMessages=\{rpcMessages\} \/> : null;/);
    assert.match(instanz, /<CardHeader ebene="h3" title=\{talk\.speakersLabel\} description=\{s\.speakersLead\} action=\{speakers\.length > 0 \? eintragen : undefined\} \/>/);
    assert.match(instanz, /<p className="ct-help">\{talk\.noSpeakerYet\}<\/p>\s*\{eintragen\}/);
    // Nur diese eine Stelle baut den Knopf; er steht nie unter der Tabelle — weder vor noch nach dem Satz, bis der Leerzustand beginnt.
    assert.equal((instanz.match(/<SpeakerHinzufuegen/g) ?? []).length, 1);
    const nichtLeer = instanz.slice(instanz.indexOf("<SpeakerTabelle"), instanz.indexOf(") : ("));
    assert.ok(nichtLeer.includes("{notiz &&"), "der Ausschnitt reicht bis hinter den Satz");
    assert.doesNotMatch(nichtLeer, /eintragen/);
    // Der Knopf kommt genau dreimal vor: gebaut, in der Kopfzeile, im Leerzustand.
    assert.equal((instanz.match(/\beintragen\b/g) ?? []).length, 3);
  });

  it("die Zeile trägt die Aktion: dieselbe Tabelle wie auf der Talk-Seite, nicht mehr die Karte mit dem Knopf darunter", () => {
    assert.match(instanz, /<SpeakerTabelle speakers=\{speakers\} canEdit=\{canEdit\} t=\{talk\} rpcMessages=\{rpcMessages\} \/>/);
    assert.match(instanz, /\{notiz && <p className="ct-help">\{notiz\}<\/p>\}/);
    const tabelle = ohneKommentare(quelle("app/(partner)/partner/talk/SpeakerTabelle.tsx"));
    assert.match(tabelle, /aria-label=\{`\$\{t\.edit\}: \$\{sp\.display_name \|\| t\.unnamed\}`\}/);
  });

  it("die Masterclass: Seitentitel h1 (PageHeader), Masterclass h2, Abschnitte h3 — und kein Formular außerhalb der gewählten", () => {
    assert.match(instanz, /<h2 className="ct-h3 text-ink">\{titel\}<\/h2>/);
    assert.equal((instanz.match(/<CardHeader ebene="h3"/g) ?? []).length, 3);
    assert.doesNotMatch(instanz, /<CardHeader ebene="h2"/);
    assert.match(instanz, /<section aria-label=\{titel\}/);
  });

  it("am Handy bricht die Aktion der Kopfzeile unter den Text (links), statt rechts gequetscht zu stehen — und der Knopftext bricht nie um", () => {
    const karte = ohneKommentare(quelle("components/ui/Card.tsx"));
    assert.match(karte, /<div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">\s*<div className="min-w-0">/);
    assert.match(ohneKommentare(quelle("app/(partner)/partner/talk/SpeakerHinzufuegen.tsx")), /size="sm" className="whitespace-nowrap"/);
  });

  it("das Formular zum Eintragen öffnet im Schubfach, nicht aufgeklappt; der Fehler steht dort; Enter löst es aus", () => {
    const f = ohneKommentare(quelle("app/(partner)/partner/talk/SpeakerHinzufuegen.tsx"));
    assert.match(f, /import \{ Drawer \} from "@\/components\/ui\/Drawer";/);
    assert.match(f, /\{offen && \(\s*<Drawer\s+open\s+onClose=\{schliessen\}\s+title=\{t\.addSpeaker\}\s+error=\{fehler\}/);
    assert.doesNotMatch(f, /role="alert"/, "der Fehler steht im Schubfach (`Drawer error`), nicht daneben");
    assert.doesNotMatch(f, /toast\("error"/);
    // Der Knopf im Fuß gehört zum Formular: `form={formId}` — so löst auch die Eingabetaste in einem Feld das Eintragen aus.
    assert.match(f, /<Button type="submit" form=\{formId\} loading=\{saving\} disabled=\{!bereit\}>/);
    assert.match(f, /<form\s+id=\{formId\}/);
    assert.match(f, /const formId = `speaker-eintragen-\$\{sessionId\}`;/);
    // Der Knopf, der es öffnet, ist der einzige sichtbare Teil; er ist klein und sekundär (die primäre Aktion der Seite ist eine andere).
    assert.match(f, /<Button variant="secondary" size="sm" className="whitespace-nowrap" onClick=\{\(\) => setOffen\(true\)\}>\s*\{t\.addSpeaker\}/);
    // Schließen setzt den Entwurf zurück: nichts bleibt für den nächsten Speaker stehen.
    assert.match(f, /function schliessen\(\) \{\s*setDraft\(\{ email: "", firstName: "", lastName: "" \}\);\s*setWeg\("eigen"\);\s*setFehler\(null\);\s*setOffen\(false\);/);
  });
});

describe("Texte: Umschalter in beiden Sprachen", () => {
  it("`instanceLabel` und `instanceNumber` stehen in DE und EN; die Nummer trägt ihren Platzhalter; deutsch in der Ihr-Ansprache", () => {
    for (const sprache of ["de", "en"] as const) {
      const t = (JSON.parse(quelle(`lib/i18n/${sprache}.json`)) as { partnerMasterclass: Record<string, string> }).partnerMasterclass;
      assert.equal(typeof t.instanceLabel, "string", `${sprache}: instanceLabel`);
      assert.ok(t.instanceLabel.length >= 5);
      assert.match(t.instanceNumber, /\{n\}/, `${sprache}: instanceNumber trägt {n}`);
      assert.ok(!/\bSie\b|\bIhre[mnrs]?\b/.test(t.instanceLabel), `${sprache}: keine Sie-Ansprache`);
    }
    // Der Lader ersetzt den Platzhalter, den das Wörterbuch trägt.
    assert.match(seite("daten.ts"), /instanceNumber\.replace\("\{n\}"/);
    assert.match(seite("MasterclassKopf.tsx"), /t\.instanceLabel/);
  });
});

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fehlerText, felderBeimUmschalten, LEERE_FELDER, startetFuerMich, zustandVon, type Felder } from "@/lib/vivenu/bestaetigung";

/**
 * TAL-020 (Design-Befund 10.10.2026, `docs/design-befund-tickets-2026-10-10.md`), Teil 1: B1 ein übersprungenes Ticket zeigt nur Gespeichertes, B2 höchstens ein
 * Ticket startet „für mich“ und die Felder folgen dem Umschalten, B8 der genaue Fehlertext gewinnt, B3 kein Versprechen ohne Weg. Die Regeln sind reine
 * Funktionen (`lib/vivenu/bestaetigung.ts`), die Verdrahtung der Ansicht wird am Quelltext geprüft — Komponenten lädt der Testlader nicht.
 */
const lies = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const ohneKommentare = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const ticket = (id: string, status: string, fuerMich = false) => ({ ticket_id: id, personalization_status: status, for_me: fuerMich });
const PROFIL: Felder = { first_name: "Mara", last_name: "Beispiel", company: "Beispiel GmbH", job_position: "Head of People" };

describe("TAL-020 B2: welches Ticket startet „für mich“?", () => {
  it("höchstens eines — das erste offene; die übrigen starten als andere Person", () => {
    const drei = [ticket("a", "pending"), ticket("b", "pending"), ticket("c", "pending")];
    assert.equal(startetFuerMich(drei), "a");
    assert.equal(drei.filter((t) => startetFuerMich(drei) === t.ticket_id).length, 1);
  });

  it("`for_me` allein sagt bei einem offenen Ticket nichts: der Ingest hängt es schon an den Käufer (ingest_vivenu_ticket)", () => {
    const drei = [ticket("a", "pending", true), ticket("b", "pending", true), ticket("c", "pending", true)];
    assert.equal(startetFuerMich(drei), "a");
  });

  it("hat die Person schon ein gespeichertes Ticket für sich, startet keines mehr „für mich“", () => {
    assert.equal(startetFuerMich([ticket("a", "complete", true), ticket("b", "pending")]), null);
    assert.equal(startetFuerMich([ticket("a", "pending"), ticket("b", "partial", true)]), null, "auch teilweise gespeichert zählt");
  });

  it("ein für eine andere Person gespeichertes Ticket nimmt „für mich“ nicht weg", () => {
    assert.equal(startetFuerMich([ticket("a", "complete", false), ticket("b", "pending")]), "b");
  });

  it("sind alle gespeichert oder gibt es keine Tickets, startet keines", () => {
    assert.equal(startetFuerMich([ticket("a", "complete"), ticket("b", "partial")]), null);
    assert.equal(startetFuerMich([]), null);
  });

  it("ein unbekannter Zustand zählt als offen, wie überall (`zustandVon`)", () => {
    assert.equal(zustandVon("irgendwas"), "pending");
    assert.equal(startetFuerMich([ticket("a", "irgendwas"), ticket("b", "pending")]), "a");
  });
});

describe("TAL-020 B2: die Felder folgen dem Umschalten", () => {
  it("auf „andere Person“: die unveränderte Vorbelegung aus dem Profil wird geleert — samt Firma und Position", () => {
    assert.deepEqual(felderBeimUmschalten({ ...PROFIL }, PROFIL, false), LEERE_FELDER);
  });

  it("der Vergleich lässt Leerzeichen außen unbeachtet", () => {
    assert.deepEqual(felderBeimUmschalten({ ...PROFIL, first_name: "  Mara " }, PROFIL, false), LEERE_FELDER);
  });

  it("Feld für Feld: was die Person selbst getippt hat, bleibt — der Rest der Vorbelegung geht", () => {
    const geaendert = { ...PROFIL, first_name: "Jonas", last_name: "Muster" };
    assert.deepEqual(felderBeimUmschalten(geaendert, PROFIL, false), { first_name: "Jonas", last_name: "Muster", company: "", job_position: "" });
  });

  it("zurück auf „für mich“: leere Felder bekommen die eigene Angabe wieder, getippte bleiben", () => {
    assert.deepEqual(felderBeimUmschalten(LEERE_FELDER, PROFIL, true), PROFIL);
    assert.deepEqual(felderBeimUmschalten({ ...LEERE_FELDER, first_name: "Mara" }, PROFIL, true), PROFIL, "der Anfang des eigenen Namens, der Rest kommt dazu");
    assert.deepEqual(felderBeimUmschalten({ ...LEERE_FELDER, first_name: "Jonas" }, PROFIL, true), { ...PROFIL, first_name: "Jonas" });
  });

  it("bei einem schon für die Person gespeicherten Ticket sind die gespeicherten Werte ihre eigenen — nicht das Profil", () => {
    const gespeichert: Felder = { first_name: "Mara", last_name: "Beispiel", company: "Andere GmbH", job_position: "CEO" };
    assert.deepEqual(felderBeimUmschalten(gespeichert, gespeichert, false), LEERE_FELDER);
    assert.deepEqual(
      felderBeimUmschalten(gespeichert, PROFIL, false),
      { first_name: "", last_name: "", company: "Andere GmbH", job_position: "CEO" },
      "gegen das Profil wären Firma und Position eine Änderung",
    );
  });

  it("ein Feld, dessen eigene Angabe leer ist, bleibt leer — es gibt nichts zu leeren", () => {
    const ohneFirma: Felder = { ...PROFIL, company: "", job_position: "" };
    assert.deepEqual(felderBeimUmschalten({ ...ohneFirma }, ohneFirma, false), LEERE_FELDER);
    assert.deepEqual(felderBeimUmschalten({ ...ohneFirma, company: "X GmbH" }, ohneFirma, false), { ...LEERE_FELDER, company: "X GmbH" });
  });

  it("hin und zurück ohne Eingabe landet wieder bei der Vorbelegung", () => {
    const aus = felderBeimUmschalten({ ...PROFIL }, PROFIL, false);
    assert.deepEqual(felderBeimUmschalten(aus, PROFIL, true), PROFIL);
  });
});

describe("TAL-020 B8: der genaue Fehlertext gewinnt, sonst das allgemeine Wörterbuch", () => {
  const de = JSON.parse(lies("lib/i18n/de.json")) as { ticketBestaetigung: Record<string, string>; rpc: Record<string, string> };
  const en = JSON.parse(lies("lib/i18n/en.json")) as { ticketBestaetigung: Record<string, string>; rpc: Record<string, string> };

  it("`name_required`: der Satz der Seite (Vor- und Nachname), nicht der allgemeine „einen Namen“", () => {
    assert.equal(fehlerText("name_required", de.ticketBestaetigung, de.rpc), de.ticketBestaetigung.name_required);
    assert.notEqual(de.ticketBestaetigung.name_required, de.rpc.name_required, "sonst gäbe es nichts zu unterscheiden");
  });

  it("`ticket_not_valid` und `ticket_not_found` haben eigene Texte in DE und EN — keinen Rat zum Neuversuch bei einem stornierten Ticket", () => {
    for (const w of [de, en]) {
      for (const key of ["ticket_not_valid", "ticket_not_found"]) {
        const text = fehlerText(key, w.ticketBestaetigung, w.rpc);
        assert.equal(text, w.ticketBestaetigung[key]);
        assert.notEqual(text, w.rpc.unknown, `${key} fiel auf den allgemeinen Text zurück`);
      }
    }
    assert.doesNotMatch(de.ticketBestaetigung.ticket_not_valid, /erneut versuchen|noch einmal/);
  });

  it("alles andere kommt aus `rpc`, Unbekanntes als „unbekannt“, ein Schlüssel der Seite ohne Fehlerbezug wird nie als Fehlertext gelesen", () => {
    assert.equal(fehlerText("not_allowed", de.ticketBestaetigung, de.rpc), de.rpc.not_allowed);
    assert.equal(fehlerText("gibt_es_nicht", de.ticketBestaetigung, de.rpc), de.rpc.unknown);
    assert.equal(fehlerText("title", de.ticketBestaetigung, de.rpc), de.rpc.unknown, "`title` ist ein Seitentext, kein Fehler");
    assert.equal(fehlerText("x", {}, {}), "x", "ohne jedes Wörterbuch bleibt der Schlüssel");
  });
});

describe("TAL-020 B1, B2, B8: die Ansicht (Quelltext)", () => {
  const ansicht = ohneKommentare(lies("app/tickets/bestaetigung/BestaetigungView.tsx"));
  const formular = ansicht.slice(ansicht.indexOf("<form onSubmit={speichern}"), ansicht.indexOf("</form>"));

  it("B2: nur das Ticket, das `startetFuerMich` nennt, startet „für mich“ — nicht mehr jedes neue", () => {
    assert.match(ansicht, /const fuerMichId = startetFuerMich\(tickets\);/);
    assert.match(ansicht, /startetFuerMich=\{k\.ticket_id === fuerMichId\}/);
    assert.match(ansicht, /useState\(vorher \? k\.for_me : startetMit\)/);
    assert.doesNotMatch(ansicht, /\? k\.for_me : true/, "alle Tickets starten wieder „für mich“");
  });

  it("B2: bei einem offenen Ticket kommen Werte nur aus dem Profil oder gar nicht — die Felder des Ingest zählen erst bei einem gespeicherten", () => {
    assert.match(ansicht, /const vorher = zustandVon\(k\.personalization_status\) !== "pending";/);
    assert.match(ansicht, /\(vorher \? k\.holder_first_name : null\) \?\? vorbelegung\.first_name/);
    assert.match(ansicht, /holder_email: vorher && !k\.for_me \? \(k\.holder_email \?\? ""\) : ""/);
  });

  it("B2: das Umschalten läuft über `felderBeimUmschalten`, nicht über ein bloßes `setFuerMich`", () => {
    assert.match(ansicht, /<Checkbox label=\{t\.forMe\} checked=\{fuerMich\} onChange=\{\(e\) => umschalten\(e\.target\.checked\)\} \/>/);
    assert.match(ansicht, /felderBeimUmschalten\(\{ first_name: x\.first_name/);
  });

  it("B2: bei einer anderen Person steht die E-Mail-Adresse vor den Namen — und der Browser trägt dort nicht die eigene Adresse ein", () => {
    assert.ok(formular.length > 200, "das Formular wurde nicht gefunden");
    assert.ok(formular.indexOf("t.holderEmail") > 0 && formular.indexOf("t.holderEmail") < formular.indexOf("t.firstName"), "E-Mail steht nicht vor dem Vornamen");
    assert.match(formular, /type="email"[^\n]*autoComplete="off"/);
  });

  it("B1: die Zusammenfassung kommt aus dem Gespeicherten, nie aus den Formularwerten; solange nichts gespeichert ist, heißt der Knopf „Ausfüllen“", () => {
    assert.doesNotMatch(ansicht, /v\.first_name \|\| v\.last_name/);
    assert.match(ansicht, /gespeichert && \(\s*<p className="ct-small mt-2">\s*\{\[gespeichert\.first_name, gespeichert\.last_name\]/, "die Zusammenfassung steht nur bei gespeicherten Angaben");
    assert.doesNotMatch(ansicht, /skippedText/, "ein offenes Ticket zeigt den Zustand (Badge) und „Ausfüllen“, keine Zusammenfassung");
    assert.match(ansicht, /\{gespeichert \? t\.edit : t\.fill\}/);
    assert.match(ansicht, /setGespeichert\(\{ first_name: v\.first_name\.trim\(\)/, "nach dem Speichern wird das Gespeicherte nachgezogen");
  });

  it("B8: der Fehlertext kommt aus `fehlerText` — die Reihenfolge „erst `rpc`, dann die Seite“ gibt es nicht mehr", () => {
    assert.match(ansicht, /setFehler\(fehlerText\(r\.key, t, rpcMessages\)\)/);
    assert.doesNotMatch(ansicht, /rpcMessages\[r\.key\] \?\? t\[r\.key\]/);
  });
});

describe("TAL-020 B3: kein Versprechen ohne Weg", () => {
  const de = JSON.parse(lies("lib/i18n/de.json")).ticketBestaetigung as Record<string, string>;
  const en = JSON.parse(lies("lib/i18n/en.json")).ticketBestaetigung as Record<string, string>;

  it("kein Text der Seite verspricht, etwas „jederzeit“ oder „später im Portal“ zu ergänzen — `/tickets` kennt den Weg noch nicht", () => {
    const warum = "Das Versprechen darf erst zurück, wenn `/tickets` einen Weg zur Bestätigung hat (TAL-020 B3, Talent mit Teil 3).";
    for (const [sprache, woerter] of [["de", de], ["en", en]] as const) {
      for (const [key, text] of Object.entries(woerter)) assert.doesNotMatch(text, /jederzeit|später|any ?time|\blater\b/i, `${sprache}.${key}: ${warum}`);
    }
  });

  it("der neue Knopftext und die Fehlertexte stehen in beiden Sprachen", () => {
    for (const k of ["fill", "ticket_not_valid", "ticket_not_found", "badgeHint"]) assert.ok(de[k] && en[k], k);
  });
});
